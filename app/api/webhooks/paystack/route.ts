import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";
import { generateReceiptImage } from "@/lib/receipt";
import { sendEmail } from "@/lib/email";
import { completePurchase } from "@/lib/complete-purchase";
import { computeScribeCut, effectivePrice, EARNINGS_HOLD_MINUTES } from "@/lib/pricing";
import { saleStatus, getTotalEarnings } from "@/lib/withdrawal";

// Register this URL (https://your-domain/api/webhooks/paystack) on the
// Paystack Dashboard under Settings -> API Keys & Webhooks. Paystack signs
// every webhook body with your secret key so we can trust it actually came
// from them and wasn't forged — we verify that BEFORE trusting anything in
// the payload, same principle as never trusting a client-supplied amount.
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  const expectedSignature = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY || "")
    .update(rawBody)
    .digest("hex");

  // timingSafeEqual, not `!==` — a plain string comparison bails out at
  // the first mismatched character, so how long the check takes leaks
  // (in principle) how many leading hex characters an attacker's guess
  // got right, letting the signature be reconstructed byte by byte over
  // enough attempts. Needs a length check first since timingSafeEqual
  // throws (rather than returning false) on mismatched buffer lengths —
  // an attacker sending a short/malformed header shouldn't crash this.
  const signatureBuffer = Buffer.from(signature ?? "", "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  const signatureValid =
    signatureBuffer.length === expectedBuffer.length && timingSafeEqual(signatureBuffer, expectedBuffer);

  if (!signature || !signatureValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);

  if (event.event === "charge.success") {
    await handleChargeSuccess(event.data);
  } else if (event.event === "transfer.success" || event.event === "transfer.failed" || event.event === "transfer.reversed") {
    await handleTransferEvent(event.event, event.data);
  } else if (event.event === "charge.dispute.create") {
    await handleDisputeCreated(event.data);
  }
  // Any other event type — nothing we care about, just acknowledge it below.

  return NextResponse.json({ received: true });
}

// Backup path for confirming a purchase, independent of the student's own
// browser finishing the job. The normal path is: pay -> get redirected to
// /payment/callback -> that page calls /api/payments/verify. If the
// student closes the tab, loses connection, or anything else interrupts
// that redirect right after Paystack has already charged them, this
// webhook is what still creates the Purchase row — Paystack notifies our
// server directly, with nothing depending on their browser at all.
//
// Both this path and /api/payments/verify call the same completePurchase
// (see lib/complete-purchase.ts), which handles two distinct duplicate
// scenarios: this exact reference being processed twice (whichever path
// gets there first wins, the other just finds the row already exists),
// and a genuinely different reference for a note the buyer already owns
// (converted to credit rather than creating a second copy or silently
// dropping their payment).
async function handleChargeSuccess(data: any) {
  const reference: string | undefined = data?.reference;
  if (!reference) return;

  const existing = await prisma.purchase.findUnique({ where: { paystackRef: reference } });
  if (existing) return; // the client-side verify call already handled this one

  const metadata = data?.metadata as {
    userId?: string;
    blockId?: string;
    noteId?: string;
    discountApplied?: boolean;
    creditApplied?: number;
    fullPrice?: number;
  };

  // Metadata is something OUR OWN server set when initializing this
  // transaction (see /api/payments/initialize) — Paystack just echoes it
  // back. Trusting it here is safe specifically because we already
  // verified this whole payload was signed by Paystack above; there's no
  // logged-in session to cross-check against in a server-to-server call,
  // unlike the browser-driven verify endpoint.
  if (!metadata?.blockId || !metadata?.noteId || !metadata?.userId) {
    console.error("Paystack webhook: charge.success missing expected metadata", reference);
    Sentry.captureMessage("Paystack webhook: charge.success missing expected metadata", {
      level: "error",
      extra: { reference },
    });
    return;
  }

  // Any refund credit reserved at initialize time only actually gets spent
  // once the purchase row is created — completePurchase handles that
  // atomically, along with the case where this charge turns out to be a
  // genuine duplicate for a note the buyer already owns.
  const amountPaid = data.amount / 100;

  try {
    await completePurchase({
      reference,
      amountPaid,
      buyerId: metadata.userId,
      noteId: metadata.noteId,
      blockId: metadata.blockId,
      discountApplied: metadata.discountApplied ?? false,
      creditApplied: metadata.creditApplied ?? 0,
    });
  } catch (err: any) {
    console.error("Paystack webhook: failed to create purchase", reference, err);
    Sentry.captureException(err, { extra: { reference, context: "webhook-charge-success" } });
  }
}

async function handleTransferEvent(eventType: string, data: any) {
  const reference: string | undefined = data?.reference;
  if (!reference) return;

  const payout = await prisma.payout.findUnique({
    where: { paystackTransferRef: reference },
    include: { scribe: true },
  });
  if (!payout) return; // reference doesn't match any payout — nothing to do

  if (eventType === "transfer.success") {
    const updated = await prisma.payout.update({
      where: { id: payout.id },
      data: { status: "PAID", paidAt: new Date() },
    });

    // Same receipt-email step as the manual mark-paid flow — best-effort,
    // doesn't affect the payout's actual paid status if it fails.
    try {
      const { scribe } = payout;
      const receiptImage = await generateReceiptImage({
        scribeName: scribe.fullName,
        amount: payout.amount,
        date: updated.paidAt!,
        reference: payout.id,
        bankName: scribe.bankName || "N/A",
        accountLast4: scribe.accountNumber?.slice(-4) || "----",
      });

      await sendEmail({
        to: scribe.email,
        subject: "Your Veloce withdrawal has been paid",
        text: `Your withdrawal of \u20a6${payout.amount.toLocaleString()} has been sent. See the attached receipt for details.`,
        html: `<p>Your withdrawal of \u20a6${payout.amount.toLocaleString()} has been sent. See the attached receipt for details.</p>`,
        attachments: [{ filename: "veloce-receipt.png", content: receiptImage, mimetype: "image/png" }],
      });
    } catch (err) {
      console.error("Failed to send payout receipt email:", err);
      Sentry.captureException(err, { extra: { payoutId: payout.id, context: "payout-receipt-email" } });
    }
  } else {
    await prisma.payout.update({
      where: { id: payout.id },
      data: { status: "FAILED", failureReason: data?.failure_reason || eventType },
    });
  }
}

// A chargeback filed with the buyer's bank, entirely outside our own
// admin-approved refund flow — the buyer never touched "Request refund" in
// Veloce. We only find out about it here, and by the time we do, the
// scribe's 30-minute hold may have already expired and the money may
// already be withdrawn. We can't undo a withdrawal that's already
// happened, but we CAN stop the bleeding immediately: revoke the buyer's
// access and pull this purchase out of every earnings calculation right
// now (reusing refundedAt does both, for free, via the exact same checks
// the admin-refund flow already relies on), and alert every admin so a
// human can decide whether to contest the dispute with Paystack.
//
// Deliberately does NOT grant credit — that's a goodwill gesture for a
// refund Veloce chose to give, not for a chargeback that happened to us.
// And if Veloce ALREADY gave credit for this purchase, that credit is
// taken back (see below) so the buyer can't be paid twice for one sale.
//
// NOTE ON PAYLOAD SHAPE: Paystack's exact dispute payload wasn't something
// I could verify against live docs while building this — it's built
// defensively (checks a couple of plausible reference locations) and logs
// loudly if none match, rather than silently no-op'ing on a shape
// mismatch. Test this against a real dispute in Paystack's dashboard
// (Settings -> API Keys & Webhooks -> Test Webhook, or trigger one in test
// mode) before relying on it, and adjust the reference lookup below if the
// real payload differs.
async function handleDisputeCreated(data: any) {
  const reference: string | undefined = data?.transaction?.reference || data?.transaction_reference || data?.reference;

  if (!reference) {
    console.error("Paystack webhook: charge.dispute.create had no recognizable reference — payload:", JSON.stringify(data));
    Sentry.captureMessage("Paystack dispute webhook: no recognizable reference in payload", {
      level: "fatal", // this is the exact scenario that needs a human immediately — a chargeback that goes unhandled
      extra: { payload: data },
    });
    return;
  }

  const purchase = await prisma.purchase.findUnique({
    where: { paystackRef: reference },
    include: {
      buyer: true,
      note: { include: { scribe: true } },
      block: { select: { title: true } },
      reports: { where: { type: "REFUND" }, select: { status: true } },
    },
  });

  if (!purchase) {
    console.error("Paystack webhook: dispute filed on a reference with no matching purchase:", reference);
    Sentry.captureMessage("Paystack dispute webhook: reference matched no purchase", {
      level: "fatal",
      extra: { reference },
    });
    return;
  }

  if (purchase.disputedAt) return; // already handled — Paystack can resend events

  const now = new Date();

  // If an admin ALREADY refunded this purchase, the buyer was given credit
  // for it — and a chargeback would now hand them the cash back as well.
  // Take that credit back (as much of it as they still have — if they've
  // already spent some, the difference is reported to the admins below).
  const alreadyRefundedWithCredit = purchase.refundedAt !== null;
  const creditGranted = purchase.amountPaid + purchase.creditApplied;

  // Was this sale already CONFIRMED — i.e. had it already cleared to the
  // scribe and platform (see the escrow model in lib/pricing.ts) — before
  // this dispute arrived? This is the only way that can happen at all: our
  // own refund flow can only ever touch a purchase that's still held (see
  // app/api/admin/purchases/[id]/refund), so a dispute is the one path
  // where a chargeback can land on money already paid out.
  const holdCutoff = new Date(Date.now() - EARNINGS_HOLD_MINUTES * 60 * 1000);
  const wasConfirmed = !alreadyRefundedWithCredit && saleStatus(purchase, holdCutoff) === "confirmed";
  const scribeCut = computeScribeCut(effectivePrice(purchase), Boolean(purchase.note.fulfillsRequestId));

  // Read earnings/promised-payout state BEFORE the transactional update
  // below — that's what "was this sale already counted as the scribe's"
  // needs to be measured against; querying it afterward would already
  // exclude this sale (refundedAt just got set) and double-subtract it.
  const [earningsBeforeDispute, promised] = await Promise.all([
    getTotalEarnings(purchase.note.scribeId),
    prisma.payout.aggregate({
      where: { scribeId: purchase.note.scribeId, status: { in: ["PENDING", "PROCESSING", "PAID"] } },
      _sum: { amount: true },
    }),
  ]);

  const creditTakenBack = await prisma.$transaction(async (tx) => {
    await tx.purchase.update({
      where: { id: purchase.id },
      data: { refundedAt: purchase.refundedAt ?? now, disputedAt: now },
    });
    await tx.report.updateMany({
      where: { purchaseId: purchase.id, type: "REFUND", status: "PENDING" },
      data: { status: "ACTIONED", reviewedAt: now },
    });

    if (!alreadyRefundedWithCredit) return 0;

    const buyer = await tx.user.findUnique({ where: { id: purchase.buyerId }, select: { creditBalance: true } });
    const take = Math.min(buyer?.creditBalance ?? 0, creditGranted);
    if (take > 0) {
      await tx.user.update({ where: { id: purchase.buyerId }, data: { creditBalance: { decrement: take } } });
    }
    return take;
  });
  const creditNotRecovered = alreadyRefundedWithCredit ? creditGranted - creditTakenBack : 0;

  // If this sale had cleared, it's now been pulled back out of the
  // scribe's earnings (refundedAt excludes it everywhere) — work out
  // whether that leaves them having already been PAID more than they now
  // have. That difference comes out of their future sales automatically,
  // but is a real loss if they never sell again — surfaced to the admins
  // below rather than silently absorbed.
  const promisedAmount = promised._sum.amount ?? 0;
  const scribeShortfall = wasConfirmed
    ? Math.max(0, promisedAmount - (earningsBeforeDispute - scribeCut)) - Math.max(0, promisedAmount - earningsBeforeDispute)
    : 0;

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", universityId: purchase.buyer.universityId },
    select: { id: true },
  });

  await prisma.adminMessage.createMany({
    data: [
      {
        recipientId: purchase.buyerId,
        senderId: null,
        subject: `A dispute was filed on "${purchase.block.title}"`,
        body: `Your bank filed a dispute on your purchase of "${purchase.block.title}", so access to it has been removed while this is investigated.${
          creditTakenBack > 0
            ? ` The ₦${creditTakenBack.toLocaleString()} credit you were given when this purchase was refunded has been taken back, since the bank is returning that money to you.`
            : ""
        }`,
      },
      {
        recipientId: purchase.note.scribeId,
        senderId: null,
        subject: `A sale of "${purchase.block.title}" is under dispute`,
        body: `A buyer's bank has disputed their purchase of your version of "${purchase.block.title}". This sale has been pulled from your earnings while it's investigated — an admin is looking into it.`,
      },
      ...admins.map((a) => ({
        recipientId: a.id,
        senderId: null,
        subject: `Chargeback filed — "${purchase.block.title}"`,
        body: `A Paystack dispute (charge.dispute.create) came in for purchase ${purchase.id} (${reference}). Access has been auto-revoked and the sale pulled from earnings. Check the Paystack dashboard to contest or accept it.${
          alreadyRefundedWithCredit
            ? ` This purchase had ALREADY been refunded with credit: ₦${creditTakenBack.toLocaleString()} of that credit was taken back${
                creditNotRecovered > 0
                  ? `, but ₦${creditNotRecovered.toLocaleString()} could not be recovered because the buyer had already spent it — consider banning the buyer.`
                  : "."
              }`
            : wasConfirmed
              ? ` This sale had already cleared to the scribe (₦${scribeCut.toLocaleString()}).${
                  scribeShortfall > 0
                    ? ` ₦${scribeShortfall.toLocaleString()} of that had already been paid out to them, so it will be deducted from their future sales.`
                    : " Not yet withdrawn, so nothing further to do there."
                }`
              : " This sale hadn't cleared yet, so nothing was ever paid out on it."
        }`,
      })),
    ],
  });
}
