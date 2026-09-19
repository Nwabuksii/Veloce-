import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import {
  SCRIBE_SHARE,
  PLATFORM_SHARE,
  computeScribeCut,
  computePlatformCut,
  computeScribeCutForCreditRedemption,
  computePlatformCutForCreditRedemption,
} from "@/lib/pricing";

export const GET = requireRole("ADMIN", async (req: NextRequest, adminUser) => {
  const purchases = await prisma.purchase.findMany({
    where: { block: { course: { department: { universityId: adminUser.universityId } } } },
    include: {
      block: { include: { course: true } },
      buyer: { select: { fullName: true } },
      note: { include: { scribe: { select: { fullName: true } } } },
    },
    orderBy: { purchasedAt: "desc" },
  });

  // Refunded purchases are excluded from every revenue figure entirely —
  // the money was actually given back, so it shouldn't count as revenue
  // for either the scribe or the platform anymore. They still show up in
  // the transaction list below (marked refunded) for a full audit trail.
  const activePurchases = purchases.filter((p) => !p.refundedAt);

  // grossRevenue is total cash actually collected (Paystack charges) —
  // separate from platformRevenue below, since a credit-redeemed sale's
  // cash goes 100% to the platform, not split with the scribe.
  const grossRevenue = activePurchases.reduce((sum, p) => sum + p.amountPaid, 0);

  // Scribe pool and platform revenue are each computed per-row, never by
  // subtracting one aggregate from the other. A credit-redeemed sale pays
  // the scribe a fixed ₦600 that comes from credit reclaimed on an earlier
  // refund — NOT out of this sale's cash, and NOT out of the platform's
  // pocket — so it must never reduce platformRevenue. The platform's cut
  // on a credit-redeemed sale is simply the cash actually charged (the
  // buyer's top-up beyond their credit), in full, not a 60/40 split of it.
  // See lib/pricing.ts.
  const scribePool = activePurchases.reduce(
    (sum, p) =>
      sum +
      (p.redeemedWithCoupon
        ? p.scribeCutOverride ?? computeScribeCutForCreditRedemption()
        : computeScribeCut(p.amountPaid, Boolean(p.note.fulfillsRequestId))),
    0
  );
  const platformRevenue = activePurchases.reduce(
    (sum, p) =>
      sum +
      (p.redeemedWithCoupon
        ? computePlatformCutForCreditRedemption(p.amountPaid)
        : computePlatformCut(p.amountPaid, Boolean(p.note.fulfillsRequestId))),
    0
  );

  // Credit: granted per-refund as a ₦ amount (not a flat count anymore —
  // see schema comments), and can be partially spent across more than one
  // purchase, so "issued minus redeemed" can't be inferred from counts
  // the way old-style 1-per-refund coupons could. Issued/redeemed are
  // summed straight off the purchase rows already fetched; outstanding is
  // read directly off live user balances instead of derived, since a
  // partially-spent credit isn't fully "issued" or "redeemed" — it's both.
  const creditIssued = purchases
    .filter((p) => p.refundedAt)
    .reduce((sum, p) => sum + p.amountPaid + p.creditApplied, 0);
  const creditRedeemed = purchases.reduce((sum, p) => sum + p.creditApplied, 0);
  const outstandingBalance = await prisma.user.aggregate({
    where: { universityId: adminUser.universityId },
    _sum: { creditBalance: true },
  });
  const creditOutstanding = outstandingBalance._sum.creditBalance ?? 0;

  const recentTransactions = purchases.slice(0, 20).map((p) => ({
    id: p.id,
    buyerName: p.buyer.fullName,
    scribeName: p.note.scribe.fullName,
    blockTitle: p.block.title,
    courseCode: p.block.course.code,
    amountPaid: p.amountPaid,
    creditApplied: p.creditApplied,
    discountApplied: p.discountApplied,
    refunded: Boolean(p.refundedAt),
    disputed: Boolean(p.disputedAt),
    redeemedWithCoupon: p.redeemedWithCoupon,
    purchasedAt: p.purchasedAt,
  }));

  return NextResponse.json({
    grossRevenue,
    platformRevenue,
    scribePool,
    transactionCount: activePurchases.length,
    scribeSharePercent: Math.round(SCRIBE_SHARE * 100),
    platformSharePercent: Math.round(PLATFORM_SHARE * 100),
    creditIssued,
    creditRedeemed,
    creditOutstanding,
    recentTransactions,
  });
});
