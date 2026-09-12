import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { SCRIBE_SHARE, PLATFORM_SHARE, computeScribeCut } from "@/lib/pricing";

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

  const grossRevenue = activePurchases.reduce((sum, p) => sum + p.amountPaid, 0);
  const scribePool = activePurchases.reduce(
    (sum, p) =>
      sum + (p.redeemedWithCoupon ? p.scribeCutOverride ?? 0 : computeScribeCut(p.amountPaid, Boolean(p.note.fulfillsRequestId))),
    0
  );
  // Can go negative on paper when coupon redemptions in a period outweigh
  // paid sales — that's real and correct: the platform is footing the
  // scribe's cut on those out of pocket, not collecting anything for them.
  const platformRevenue = grossRevenue - scribePool;

  // Coupons: 1 is granted per successful refund, so refund count *is*
  // issuance count — no separate ledger table needed. Outstanding is
  // simply issued minus redeemed, which stays exactly equal to the sum of
  // every user's live couponBalance as long as coupons are only ever
  // granted via refund and only ever spent via redemption (true by
  // construction here), without an extra full-table scan to prove it.
  const couponsIssued = purchases.filter((p) => p.refundedAt).length;
  const couponsRedeemed = purchases.filter((p) => p.redeemedWithCoupon).length;
  const couponsOutstanding = couponsIssued - couponsRedeemed;

  const recentTransactions = purchases.slice(0, 20).map((p) => ({
    id: p.id,
    buyerName: p.buyer.fullName,
    scribeName: p.note.scribe.fullName,
    blockTitle: p.block.title,
    courseCode: p.block.course.code,
    amountPaid: p.amountPaid,
    discountApplied: p.discountApplied,
    refunded: Boolean(p.refundedAt),
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
    couponsIssued,
    couponsRedeemed,
    couponsOutstanding,
    recentTransactions,
  });
});
