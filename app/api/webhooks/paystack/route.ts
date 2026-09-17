import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";
import { generateReceiptImage } from "@/lib/receipt";
import { sendEmail } from "@/lib/email";
import { computeScribeCut } from "@/lib/pricing";

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

  if (!signature || signature !== expectedSignature) {
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
// Both this path and /api/payments/verify are duplicate-safe (unique
// constraint on Purchase.paystackRef) and can run in either order —
// whichever one runs first creates the row, the other one just finds it
// already exists and does nothing further.
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
  // once the purchase row is created — bundled in the same transaction so
  // a duplicate webhook delivery (P2002 below) can never double-decrement.
  const creditApplied = metadata.creditApplied ?? 0;
  const amountPaid = data.amount / 100;
  const fullPrice = metadata.fullPrice ?? amountPaid + creditApplied;

  try {
    await prisma.$transaction([
      ...(creditApplied > 0
        ? [prisma.user.update({ where: { id: metadata.userId }, data: { creditBalance: { decrement: creditApplied } } })]
        : []),
      prisma.purchase.create({
        data: {
          buyerId: metadata.userId,
          noteId: metadata.noteId,
          blockId: metadata.blockId,
          amountPaid,
          discountApplied: metadata.discountApplied ?? false,
          creditApplied,
          redeemedWithCoupon: creditApplied > 0,
          scribeCutOverride: creditApplied > 0 ? computeScribeCut(fullPrice, metadata.discountApplied ?? false) : null,
          paystackRef: reference,
        },
      }),
    ]);
  } catch (err: any) {
    // P2002 = the client-side verify call won the race and created it a
    // moment earlier — not an error, just the other path getting there first.
    if (err?.code !== "P2002") {
      console.error("Paystack webhook: failed to create purchase", reference, err);
      Sentry.captureException(err, { extra: { reference, context: "webhook-charge-success" } });
    }
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
// Deliberately does NOT grant a coupon — that's a goodwill gesture for a
// refund Veloce chose to give, not for a chargeback that happened to us.
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

  await prisma.$transaction([
    prisma.purchase.update({
      where: { id: purchase.id },
      data: { refundedAt: purchase.refundedAt ?? now, disputedAt: now },
    }),
    prisma.report.updateMany({
      where: { purchaseId: purchase.id, type: "REFUND", status: "PENDING" },
      data: { status: "ACTIONED", reviewedAt: now },
    }),
  ]);

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
        body: `Your bank filed a dispute on your purchase of "${purchase.block.title}", so access to it has been removed while this is investigated.`,
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
        body: `A Paystack dispute (charge.dispute.create) came in for purchase ${purchase.id} (${reference}). Access has been auto-revoked and the sale pulled from earnings. Check the Paystack dashboard to contest or accept it.`,
      })),
    ],
  });
}
