import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { computeScribeCut, computeScribeCutForCreditRedemption } from "@/lib/pricing";

interface RouteContext {
  params: { id: string };
}

// The single action behind "admin selects refund": revokes the buyer's
// access to the note, reverses whatever the scribe was credited for this
// sale (it simply drops out of every earnings calculation from here on,
// since lib/withdrawal.ts, the admin finance route, and the scribe
// earnings route all filter on `refundedAt: null`), grants the buyer one
// coupon, resolves any pending refund report(s) on this purchase, and
// messages both people involved.
export const POST = requireRole<RouteContext>("ADMIN", async (req: NextRequest, adminUser, ctx) => {
  const purchaseId = ctx.params.id;

  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      buyer: true,
      note: { include: { scribe: true } },
      block: { select: { title: true } },
    },
  });

  if (!purchase) {
    return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
  }

  if (purchase.buyer.universityId !== adminUser.universityId) {
    return NextResponse.json({ error: "Cannot manage purchases outside your university" }, { status: 403 });
  }

  if (purchase.refundedAt) {
    return NextResponse.json({ error: "This purchase has already been refunded" }, { status: 409 });
  }

  // What's reversed from the scribe (and the only thing this refund ever
  // touches): a fixed ₦600 if this sale itself was paid via credit,
  // otherwise the normal cut on what was actually paid. The platform's cut
  // on this sale is NEVER reversed here — it stays banked, permanently.
  const lostCut = purchase.redeemedWithCoupon
    ? purchase.scribeCutOverride ?? computeScribeCutForCreditRedemption()
    : computeScribeCut(purchase.amountPaid, Boolean(purchase.note.fulfillsRequestId));

  // What the buyer gets back as spendable credit: cash paid plus whatever
  // credit they'd already spent on this purchase — this is the credit's
  // FACE VALUE (used only to work out how much top-up cash, if any, a
  // future purchase needs), not the amount that actually moves anywhere.
  // Only ₦600 of it ever moves — to whichever scribe they eventually buy
  // from with it — the rest is the platform's already-banked cut, which
  // this face value does not touch or re-grant. See lib/pricing.ts.
  const creditToGrant = purchase.amountPaid + purchase.creditApplied;

  const pendingReports = await prisma.report.findMany({
    where: { purchaseId: purchase.id, type: "REFUND", status: "PENDING" },
  });

  const now = new Date();

  // Interactive transaction, and the first write is a guarded updateMany
  // (refundedAt: null in the WHERE) rather than the plain `update` used
  // before — two admins (or one admin double-clicking) refunding the same
  // purchase at nearly the same moment could both pass the `if
  // (purchase.refundedAt)` check above off the same stale read and both
  // proceed to grant credit, double-paying the buyer. The second write to
  // reach this WHERE clause now sees the row the first one just updated
  // and correctly matches zero rows instead.
  const result = await prisma.$transaction(async (tx) => {
    const updateResult = await tx.purchase.updateMany({
      where: { id: purchase.id, refundedAt: null },
      data: { refundedAt: now },
    });
    if (updateResult.count === 0) return null;

    await tx.user.update({
      where: { id: purchase.buyerId },
      data: { creditBalance: { increment: creditToGrant } },
    });

    if (pendingReports.length > 0) {
      await tx.report.updateMany({
        where: { id: { in: pendingReports.map((r) => r.id) } },
        data: { status: "ACTIONED", reviewedAt: now, reviewedById: adminUser.sub },
      });
    }

    await tx.adminMessage.create({
      data: {
        recipientId: purchase.buyerId,
        senderId: adminUser.sub,
        subject: `Refund processed — "${purchase.block.title}"`,
        body: `Your purchase of "${purchase.block.title}" was refunded and you no longer have access to it. As an apology for the trouble, you've been given ₦${creditToGrant.toLocaleString()} in credit — it'll be applied automatically toward your next purchase(s), covering the price up to that amount.`,
      },
    });
    await tx.adminMessage.create({
      data: {
        recipientId: purchase.note.scribeId,
        senderId: adminUser.sub,
        subject: `A sale of "${purchase.block.title}" was refunded`,
        body: `An admin refunded a buyer's purchase of your version of "${purchase.block.title}". ₦${lostCut.toLocaleString()} has been reversed from your earnings for this sale.`,
      },
    });

    return true;
  });

  if (!result) {
    return NextResponse.json({ error: "This purchase has already been refunded" }, { status: 409 });
  }

  return NextResponse.json({
    purchase: { id: purchase.id, refunded: true },
    scribeCutReversed: lostCut,
    reportsResolved: pendingReports.length,
  });
});
