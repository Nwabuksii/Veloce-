import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

interface RouteContext {
  params: { id: string };
}

// The "approve" action on a REFUND-type report (see app/admin/reports).
// Under the escrow model (see lib/pricing.ts), a purchase with a pending
// refund report was never disbursed to anyone — it's been held, untouched,
// since the moment the request was filed. So approving it never has to
// claw anything back from a scribe or reverse platform revenue: it simply
// hands the buyer their ENTIRE price back as credit, dollar for dollar,
// and the sale never becomes anyone's money at all.
//
// Requires an actual pending REFUND report to exist for this purchase —
// this route is only ever reached from the admin reports queue, and
// tying it to a real report is what guarantees the purchase is still
// genuinely held (a purchase with no pending report has either already
// cleared to the scribe/platform, or was already resolved) rather than
// letting an admin refund an already-confirmed sale out of band.
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

  // Authority follows the content, not the buyer: only the admin at the
  // SCRIBE'S university can act here, matching the report-routing rule
  // above (see lib/report-scope.ts) and the revenue-attribution rule
  // (a sale/refund is always the content-owning university's to manage).
  if (purchase.note.scribe.universityId !== adminUser.universityId) {
    return NextResponse.json({ error: "Cannot manage purchases outside your university" }, { status: 403 });
  }

  if (purchase.refundedAt) {
    return NextResponse.json({ error: "This purchase has already been refunded" }, { status: 409 });
  }

  const pendingReports = await prisma.report.findMany({
    where: { purchaseId: purchase.id, type: "REFUND", status: "PENDING" },
  });

  if (pendingReports.length === 0) {
    return NextResponse.json(
      { error: "There's no pending refund request on this purchase to approve." },
      { status: 400 }
    );
  }

  // The buyer's entire price back, cash and credit combined — see
  // lib/pricing.ts's effectivePrice. Nothing is split off for anyone,
  // because nothing was ever earned on this sale in the first place.
  const creditToGrant = purchase.amountPaid + purchase.creditApplied;

  const now = new Date();

  // Interactive transaction, and the first write is a guarded updateMany
  // (refundedAt: null in the WHERE) rather than a plain `update` — two
  // admins (or one admin double-clicking) refunding the same purchase at
  // nearly the same moment could both pass the `if (purchase.refundedAt)`
  // check above off the same stale read and both proceed to grant credit,
  // double-paying the buyer. The second write to reach this WHERE clause
  // now sees the row the first one just updated and correctly matches zero
  // rows instead.
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

    await tx.report.updateMany({
      where: { id: { in: pendingReports.map((r) => r.id) } },
      data: { status: "ACTIONED", reviewedAt: now, reviewedById: adminUser.sub },
    });

    await tx.adminMessage.create({
      data: {
        recipientId: purchase.buyerId,
        senderId: adminUser.sub,
        subject: `Refund processed — "${purchase.block.title}"`,
        body: `Your purchase of "${purchase.block.title}" was refunded and you no longer have access to it. Your ₦${creditToGrant.toLocaleString()} has been added to your credit balance — it's real, spendable credit that'll apply automatically toward your next purchase(s), covering the price up to that amount.`,
      },
    });
    await tx.adminMessage.create({
      data: {
        recipientId: purchase.note.scribeId,
        senderId: adminUser.sub,
        subject: `A sale of "${purchase.block.title}" was refunded`,
        body: `A buyer's purchase of your version of "${purchase.block.title}" was refunded before it cleared, so nothing changes for your balance — this sale was still on hold and had never been counted as yours.`,
      },
    });

    return true;
  });

  if (!result) {
    return NextResponse.json({ error: "This purchase has already been refunded" }, { status: 409 });
  }

  return NextResponse.json({
    purchase: { id: purchase.id, refunded: true },
    creditGranted: creditToGrant,
    reportsResolved: pendingReports.length,
  });
});
