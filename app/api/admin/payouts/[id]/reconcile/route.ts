import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { verifyTransfer } from "@/lib/paystack";
import { outcomeFromPaystackStatus, settlePayout, sendPayoutReceipt } from "@/lib/payout-settlement";
import { logSecurityEvent } from "@/lib/security-log";

interface RouteContext {
  params: { id: string };
}

// For a payout stuck on PROCESSING — typically after approve got no answer
// from Paystack (see approve/route.ts) and the webhook never arrived. Asks
// Paystack what actually happened to the transfer and applies the result
// with the same rules as the webhook, so running it twice, or at the same
// moment as a late webhook, can only settle the payout once.
//
// Deliberately never moves a payout back to PENDING: "Paystack has no
// record of it yet" is not proof that no money is on its way.
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
    return NextResponse.json({ error: `Only a payout that's still processing can be checked — this one is ${payout.status.toLowerCase()}` }, { status: 409 });
  }

  if (!payout.paystackTransferRef) {
    return NextResponse.json(
      { error: "This payout was approved for a manual transfer, so there's nothing to check with Paystack. Use \"Mark as paid\" once you've sent it." },
      { status: 400 }
    );
  }

  let transfer: { status: string; failureReason?: string };
  try {
    transfer = await verifyTransfer(payout.paystackTransferRef);
  } catch (err) {
    console.error("Payout reconcile: Paystack lookup failed:", payout.id, err);
    return NextResponse.json(
      { error: "Couldn't get an answer from Paystack for this transfer. It's still PROCESSING — check the Paystack dashboard for reference " + payout.paystackTransferRef + " or try again shortly." },
      { status: 502 }
    );
  }

  const outcome = outcomeFromPaystackStatus(transfer.status);
  if (!outcome) {
    await logSecurityEvent("payout_reconciled", { payoutId: payout.id, adminId: adminUser.sub, paystackStatus: transfer.status, settled: false });
    // Re-read without the scribe relation, which carries the whole user row.
    return NextResponse.json({
      payout: await prisma.payout.findUnique({ where: { id: payout.id } }),
      paystackStatus: transfer.status,
      settled: false,
      message: `Paystack still shows this transfer as "${transfer.status}". Nothing was changed — check again later.`,
    });
  }

  const result = await settlePayout(payout, outcome, transfer.failureReason, "reconcile");
  if (result.applied && result.to === "PAID") {
    await sendPayoutReceipt(payout, new Date());
  }
  await logSecurityEvent("payout_reconciled", {
    payoutId: payout.id,
    adminId: adminUser.sub,
    paystackStatus: transfer.status,
    settled: result.applied,
  });

  const updated = await prisma.payout.findUnique({ where: { id: payout.id } });
  return NextResponse.json({ payout: updated, paystackStatus: transfer.status, settled: result.applied });
});
