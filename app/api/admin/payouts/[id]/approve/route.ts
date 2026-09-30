import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { logSecurityEvent } from "@/lib/security-log";
import { createTransferRecipient, initiateTransfer, PaystackRejectedError } from "@/lib/paystack";
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

  // CLAIM the payout before doing anything else. The status check above is
  // only a fast, friendly rejection — it can't stop two requests (a double
  // click, or approve racing reject) that both read PENDING. This single
  // conditional UPDATE can: the database lets exactly one caller flip
  // PENDING -> PROCESSING, and everyone else gets count 0 and stops here,
  // before Paystack is ever contacted.
  const reference = `veloce-payout-${randomUUID()}`;
  const claim = await prisma.payout.updateMany({
    where: { id: payout.id, status: "PENDING" },
    data: {
      status: "PROCESSING",
      processedAt: new Date(),
      processedById: adminUser.sub,
      // Saved at claim time so the reference exists in our records BEFORE the
      // transfer is attempted — Paystack's webhook can always find this
      // payout, even if we never hear back from the API call itself.
      ...(PAYOUTS_AUTOMATED ? { paystackTransferRef: reference } : {}),
    },
  });

  if (claim.count !== 1) {
    return NextResponse.json({ error: "This payout was just handled by someone else — refresh to see its status" }, { status: 409 });
  }

  await logSecurityEvent("payout_approved", { payoutId: payout.id, scribeId: scribe.id, amount: payout.amount, byAdminId: adminUser.sub, automated: PAYOUTS_AUTOMATED });

  if (!PAYOUTS_AUTOMATED) {
    // Manual mode — no Paystack call. The admin sends the money by hand
    // (using the account details already shown in the queue) and comes
    // back to hit "Mark as paid" once it's actually sent.
    const updated = await prisma.payout.findUnique({ where: { id: payout.id } });
    return NextResponse.json({ payout: updated });
  }

  // Step 1 — register the recipient with Paystack once, then reuse it
  // forever (cached on the User row). Nothing has been sent yet at this
  // point, so ANY failure here is safe to undo: put the payout back to
  // PENDING so the admin can simply try again.
  let recipientCode = scribe.payoutRecipientCode;
  if (!recipientCode) {
    try {
      recipientCode = await createTransferRecipient({
        accountName: scribe.accountName,
        accountNumber: scribe.accountNumber,
        bankCode: scribe.bankCode,
      });
      await prisma.user.update({ where: { id: scribe.id }, data: { payoutRecipientCode: recipientCode } });
    } catch (err: any) {
      await prisma.payout.updateMany({
        where: { id: payout.id, status: "PROCESSING", paystackTransferRef: reference },
        data: { status: "PENDING", processedAt: null, processedById: null, paystackTransferRef: null },
      });
      console.error("Payout approve: recipient setup failed:", payout.id, err);
      return NextResponse.json(
        { error: "Couldn't register this scribe's bank account with Paystack. Nothing was sent — you can try again." },
        { status: 502 }
      );
    }
  }

  // Step 2 — the actual transfer.
  try {
    await initiateTransfer({
      amount: payout.amount,
      recipientCode,
      reference,
      reason: "Veloce scribe withdrawal",
    });
  } catch (err: any) {
    if (err instanceof PaystackRejectedError) {
      // Paystack explicitly said no, so we KNOW no money moved. Only now is
      // it correct to mark FAILED (which releases the scribe's balance).
      // Guarded on PROCESSING so a webhook that already settled this payout
      // is never overwritten.
      await prisma.payout.updateMany({
        where: { id: payout.id, status: "PROCESSING" },
        data: { status: "FAILED", failureReason: err.message },
      });
      return NextResponse.json({ error: err.message || "Transfer failed" }, { status: 502 });
    }

    // Timeout / network drop / 5xx: the transfer may or may not exist on
    // Paystack's side. Marking it FAILED here would free the scribe's
    // balance while the money might still be on its way out — the double
    // spend. Leave it PROCESSING; the transfer.success / transfer.failed
    // webhook (matched on the reference saved above) settles it.
    console.error("Payout approve: transfer outcome unknown:", payout.id, reference, err);
    return NextResponse.json(
      {
        error:
          "Paystack didn't confirm whether this transfer went through, so it has been left as PROCESSING. Check the Paystack dashboard for reference " +
          reference +
          " — the payout will update automatically when Paystack reports back.",
        unknownOutcome: true,
        reference,
      },
      // Deliberately an error status, not 202: the admin page only shows the
      // message on non-2xx, and a success-looking response would tell the
      // admin the transfer went through when we genuinely don't know.
      { status: 502 }
    );
  }

  const updated = await prisma.payout.findUnique({ where: { id: payout.id } });
  return NextResponse.json({ payout: updated });
});
