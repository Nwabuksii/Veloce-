import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { generateReceiptImage } from "@/lib/receipt";
import { sendEmail } from "@/lib/email";

interface RouteContext {
  params: { id: string };
}

// Manual-mode only — the admin has actually sent the money themselves
// (their own banking app, or Paystack's dashboard directly) and is
// confirming it here. In automated mode this step doesn't exist; the
// webhook (see /api/webhooks/paystack) does this automatically instead.
export const POST = requireRole<RouteContext>("ADMIN", async (req: NextRequest, adminUser, ctx) => {
  const payout = await prisma.payout.findUnique({
    where: { id: ctx.params.id },
    include: { scribe: true },
  });

  if (!payout) {
    return NextResponse.json({ error: "Payout request not found" }, { status: 404 });
  }

  if (payout.scribe.universityId !== adminUser.universityId) {
    return NextResponse.json({ error: "Cannot manage payouts outside your university" }, { status: 403 });
  }

  if (payout.status !== "PROCESSING") {
    return NextResponse.json(
      { error: "Only a payout you've already approved can be marked as paid" },
      { status: 409 }
    );
  }

  const updated = await prisma.payout.update({
    where: { id: payout.id },
    data: { status: "PAID", paidAt: new Date() },
  });

  // Best-effort — a failed receipt email shouldn't undo the fact that the
  // payout itself is genuinely marked paid; log it and move on rather than
  // erroring the whole request over an email hiccup.
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

  return NextResponse.json({ payout: updated });
});
