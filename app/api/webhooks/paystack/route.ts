import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { generateReceiptImage } from "@/lib/receipt";
import { sendEmail } from "@/lib/email";

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
  };

  // Metadata is something OUR OWN server set when initializing this
  // transaction (see /api/payments/initialize) — Paystack just echoes it
  // back. Trusting it here is safe specifically because we already
  // verified this whole payload was signed by Paystack above; there's no
  // logged-in session to cross-check against in a server-to-server call,
  // unlike the browser-driven verify endpoint.
  if (!metadata?.blockId || !metadata?.noteId || !metadata?.userId) {
    console.error("Paystack webhook: charge.success missing expected metadata", reference);
    return;
  }

  try {
    await prisma.purchase.create({
      data: {
        buyerId: metadata.userId,
        noteId: metadata.noteId,
        blockId: metadata.blockId,
        amountPaid: data.amount / 100,
        discountApplied: metadata.discountApplied ?? false,
        paystackRef: reference,
      },
    });
  } catch (err: any) {
    // P2002 = the client-side verify call won the race and created it a
    // moment earlier — not an error, just the other path getting there first.
    if (err?.code !== "P2002") {
      console.error("Paystack webhook: failed to create purchase", reference, err);
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
    }
  } else {
    await prisma.payout.update({
      where: { id: payout.id },
      data: { status: "FAILED", failureReason: data?.failure_reason || eventType },
    });
  }
}
