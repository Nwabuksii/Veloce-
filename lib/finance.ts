import { prisma } from "@/lib/prisma";
import { SCRIBE_SHARE, PLATFORM_SHARE, computeScribeCut, computePlatformCut, effectivePrice, EARNINGS_HOLD_MINUTES } from "@/lib/pricing";
import { saleStatus } from "@/lib/withdrawal";

// Shared by both /api/admin/finance (the plain ledger) and
// /api/admin/finance/advanced (same numbers, plus the escrow breakdown) —
// one query and one set of formulas, so the two pages can never disagree
// with each other about what a naira is doing.
//
// Every purchase sits in one of four buckets, and — this is the whole
// point of the escrow model in lib/pricing.ts — a naira only ever counts
// toward platformRevenue/scribePool once it's CONFIRMED:
//   confirmed      — resolved (hold passed, or a refund request was
//                    declined). Counts as real revenue/earnings.
//   clearing       — still inside the hold window. Nobody's yet.
//   refund_review  — a refund request is awaiting an admin. Nobody's yet.
//   refunded       — refund was approved (or a dispute hit it). Never
//                    became anyone's; the buyer has it back as credit
//                    (unless disputed, in which case it left via chargeback
//                    and isn't credit either).
export async function getFinanceData(universityId: string) {
  const holdCutoff = new Date(Date.now() - EARNINGS_HOLD_MINUTES * 60 * 1000);

  const purchases = await prisma.purchase.findMany({
    where: { block: { course: { department: { universityId } } } },
    include: {
      block: { include: { course: true } },
      buyer: { select: { fullName: true } },
      note: { include: { scribe: { select: { fullName: true } } } },
      reports: { where: { type: "REFUND" }, select: { status: true } },
    },
    orderBy: { purchasedAt: "desc" },
  });

  const disputed = purchases.filter((p) => p.disputedAt);
  const refundedNotDisputed = purchases.filter((p) => p.refundedAt && !p.disputedAt);
  const neverRefunded = purchases.filter((p) => !p.refundedAt);
  // Everything whose cash the platform still actually holds — real sales
  // plus admin-refunded ones (still credit, still ours), minus genuine
  // chargebacks (cash actually left via the bank).
  const cashRetained = [...neverRefunded, ...refundedNotDisputed];

  const isFulfillment = (p: (typeof purchases)[number]) => Boolean(p.note.fulfillsRequestId);
  const scribeCutOf = (p: (typeof purchases)[number]) => computeScribeCut(effectivePrice(p), isFulfillment(p));
  const platformCutOf = (p: (typeof purchases)[number]) => computePlatformCut(effectivePrice(p), isFulfillment(p));

  const clearing = neverRefunded.filter((p) => saleStatus(p, holdCutoff) === "clearing");
  const refundReview = neverRefunded.filter((p) => saleStatus(p, holdCutoff) === "refund_review");
  const confirmed = neverRefunded.filter((p) => saleStatus(p, holdCutoff) === "confirmed");

  // Charges that never became a sale at all — duplicate payments, or
  // credit that changed mid-checkout (see lib/complete-purchase.ts). The
  // whole amount became credit, dollar for dollar; none of it was ever
  // anyone's to split.
  const converted = await prisma.convertedPayment.findMany({
    where: { user: { universityId } },
    select: { amount: true },
  });
  const convertedCash = converted.reduce((sum, c) => sum + c.amount, 0);

  // Gross revenue has to reflect the full sale value actually moved,
  // not just the cash paid out of pocket. Credit is real money already
  // counted as part of the purchase value, so the total has to use
  // effectivePrice(p) (cash + credit), not amountPaid alone.
  const grossRevenue = cashRetained.reduce((sum, p) => sum + effectivePrice(p), 0) + convertedCash;
  const platformRevenue = confirmed.reduce((sum, p) => sum + platformCutOf(p), 0);
  const scribePool = confirmed.reduce((sum, p) => sum + scribeCutOf(p), 0);

  // Credit is always real, unencumbered cash (see lib/pricing.ts) —
  // granted in full on every approved refund, plus every converted
  // payment. Disputes are excluded: handleDisputeCreated deliberately
  // never grants credit for a raw chargeback (see the webhook).
  const creditIssued = refundedNotDisputed.reduce((sum, p) => sum + p.amountPaid + p.creditApplied, 0) + convertedCash;
  const creditRedeemed = purchases.reduce((sum, p) => sum + p.creditApplied, 0);
  const outstandingBalance = await prisma.user.aggregate({ where: { universityId }, _sum: { creditBalance: true } });
  const creditOutstanding = outstandingBalance._sum.creditBalance ?? 0;

  const toTx = (p: (typeof purchases)[number]) => ({
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
    price: effectivePrice(p),
    scribeCut: scribeCutOf(p),
    platformCut: platformCutOf(p),
  });

  return {
    grossRevenue,
    platformRevenue,
    scribePool,
    transactionCount: cashRetained.length,
    scribeSharePercent: Math.round(SCRIBE_SHARE * 100),
    platformSharePercent: Math.round(PLATFORM_SHARE * 100),
    creditIssued,
    creditRedeemed,
    creditOutstanding,
    recentTransactions: purchases.slice(0, 20).map(toTx),

    // Advanced-only: the escrow breakdown. Every naira here is money that
    // WILL become platformRevenue/scribePool once resolved (if it clears
    // or a refund is declined) or WILL become credit (if a refund is
    // approved) — none of it is counted in the totals above yet.
    clearing: {
      count: clearing.length,
      total: clearing.reduce((sum, p) => sum + effectivePrice(p), 0),
      scribePortion: clearing.reduce((sum, p) => sum + scribeCutOf(p), 0),
      platformPortion: clearing.reduce((sum, p) => sum + platformCutOf(p), 0),
      recent: clearing.slice(0, 20).map(toTx),
    },
    refundReview: {
      count: refundReview.length,
      total: refundReview.reduce((sum, p) => sum + effectivePrice(p), 0),
      scribePortion: refundReview.reduce((sum, p) => sum + scribeCutOf(p), 0),
      platformPortion: refundReview.reduce((sum, p) => sum + platformCutOf(p), 0),
      recent: refundReview.slice(0, 20).map(toTx),
    },
    disputedCount: disputed.length,
  };
}

export type FinanceData = Awaited<ReturnType<typeof getFinanceData>>;
