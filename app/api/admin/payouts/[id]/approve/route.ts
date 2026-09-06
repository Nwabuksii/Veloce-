import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { createTransferRecipient, initiateTransfer } from "@/lib/paystack";
import { PAYOUTS_AUTOMATED } from "@/lib/payout-mode";

interface RouteContext {
  params: { id: string };
}

// In automated mode, this is the single click that actually moves money via
// Paystack's Transfer API. In manual mode (see lib/payout-mode.ts), this
// just marks the request as accepted — the admin still has to send the
// money themselves and then call the mark-paid endpoint once it's sent.
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

  if (payout.status !== "PENDING") {
    return NextResponse.json({ error: `Payout already ${payout.status.toLowerCase()}` }, { status: 409 });
  }

  const { scribe } = payout;
  if (!scribe.accountNumber || !scribe.bankCode || !scribe.accountName) {
    return NextResponse.json({ error: "This scribe hasn't set up bank details" }, { status: 400 });
  }

  if (!PAYOUTS_AUTOMATED) {
    // Manual mode — no Paystack call. The admin sends the money by hand
    // (using the account details already shown in the queue) and comes
    // back to hit "Mark as paid" once it's actually sent.
    const updated = await prisma.payout.update({
      where: { id: payout.id },
      data: { status: "PROCESSING", processedAt: new Date(), processedById: adminUser.sub },
    });
    return NextResponse.json({ payout: updated });
  }

  try {
    // Register the recipient with Paystack once, then reuse it forever —
    // cached on the User row so a scribe with many payouts over time only
    // ever gets registered the first time.
    let recipientCode = scribe.payoutRecipientCode;
    if (!recipientCode) {
      recipientCode = await createTransferRecipient({
        accountName: scribe.accountName,
        accountNumber: scribe.accountNumber,
        bankCode: scribe.bankCode,
      });
      await prisma.user.update({ where: { id: scribe.id }, data: { payoutRecipientCode: recipientCode } });
    }

    const reference = `veloce-payout-${randomUUID()}`;

    await initiateTransfer({
      amount: payout.amount,
      recipientCode,
      reference,
      reason: "Veloce scribe withdrawal",
    });

    const updated = await prisma.payout.update({
      where: { id: payout.id },
      data: {
        status: "PROCESSING",
        processedAt: new Date(),
        processedById: adminUser.sub,
        paystackTransferRef: reference,
      },
    });

    return NextResponse.json({ payout: updated });
  } catch (err: any) {
    // Paystack rejected the transfer outright (bad recipient, insufficient
    // balance, etc.) — fail it now rather than leaving it stuck PENDING.
    const updated = await prisma.payout.update({
      where: { id: payout.id },
      data: { status: "FAILED", processedAt: new Date(), processedById: adminUser.sub, failureReason: err?.message },
    });
    return NextResponse.json({ error: err?.message || "Transfer failed", payout: updated }, { status: 502 });
  }
});
