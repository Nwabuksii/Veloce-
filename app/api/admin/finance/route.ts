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

  // A refund and a dispute/chargeback are NOT the same thing financially,
  // even though a dispute also sets refundedAt (see the webhook's
  // handleDisputeCreated) — they need to be told apart here:
  //
  //   - Admin-approved refund (refundedAt set, disputedAt null): nothing
  //     is ever sent back through Paystack for this (see
  //     app/api/admin/purchases/[id]/refund) — access is revoked and the
  //     buyer is given spendable credit instead. The cash never left, so
  //     it still counts as real revenue: the platform's cut is untouched
  //     ("left there"), and only the scribe's cut is pulled out of the
  //     scribe pool (reversed, no longer owed — until the credit is later
  //     spent with some scribe, at which point THAT purchase row adds the
  //     fixed ₦600 back into scribePool on its own, same as any other
  //     credit-redeemed sale above).
  //   - Chargeback/dispute (disputedAt set): the buyer's bank actually
  //     pulled the money back from Paystack. Nobody keeps anything, so
  //     this is excluded from every figure below, same as before.
  const refundedNotDisputed = purchases.filter((p) => p.refundedAt && !p.disputedAt);
  const neverRefunded = purchases.filter((p) => !p.refundedAt);
  // Everything whose cash the platform still actually holds — real sales
  // plus admin-refunded ones, minus genuine chargebacks.
  const cashRetained = [...neverRefunded, ...refundedNotDisputed];

  // grossRevenue is total cash actually collected (Paystack charges) that
  // the platform still holds — includes admin-refunded sales (cash never
  // left), excludes disputed ones (cash left via chargeback).
  const grossRevenue = cashRetained.reduce((sum, p) => sum + p.amountPaid, 0);

  // Scribe pool and platform revenue are each computed per-row, never by
  // subtracting one aggregate from the other. A credit-redeemed sale pays
  // the scribe a fixed ₦600 that comes from credit reclaimed on an earlier
  // refund — NOT out of this sale's cash, and NOT out of the platform's
  // pocket — so it must never reduce platformRevenue. The platform's cut
  // on a credit-redeemed sale is simply the cash actually charged (the
  // buyer's top-up beyond their credit), in full, not a 60/40 split of it.
  // See lib/pricing.ts.
  const scribeCutOf = (p: (typeof purchases)[number]) =>
    p.redeemedWithCoupon
      ? p.scribeCutOverride ?? computeScribeCutForCreditRedemption()
      : computeScribeCut(p.amountPaid, Boolean(p.note.fulfillsRequestId));
  const platformCutOf = (p: (typeof purchases)[number]) =>
    p.redeemedWithCoupon
      ? computePlatformCutForCreditRedemption(p.amountPaid)
      : computePlatformCut(p.amountPaid, Boolean(p.note.fulfillsRequestId));

  // Only sales that are still fully "owned" by their scribe count toward
  // the pool — an admin-refunded sale's scribe cut is reversed the moment
  // it's refunded, same as a disputed one.
  const scribePool = neverRefunded.reduce((sum, p) => sum + scribeCutOf(p), 0);
  // Platform revenue includes admin-refunded sales (their cut was never
  // touched) alongside never-refunded ones — only disputes remove it.
  const platformRevenue = cashRetained.reduce((sum, p) => sum + platformCutOf(p), 0);

  // Transaction count matches whatever contributed to grossRevenue/platformRevenue above.
  const activePurchases = cashRetained;

  // Credit: granted per-refund as a ₦ amount (not a flat count anymore —
  // see schema comments), and can be partially spent across more than one
  // purchase, so "issued minus redeemed" can't be inferred from counts
  // the way old-style 1-per-refund coupons could. Issued/redeemed are
  // summed straight off the purchase rows already fetched; outstanding is
  // read directly off live user balances instead of derived, since a
  // partially-spent credit isn't fully "issued" or "redeemed" — it's both.
  // Disputes are excluded here too — handleDisputeCreated deliberately
  // never grants credit (see the webhook), so counting a disputed
  // purchase here would overstate how much credit was actually issued.
  const creditIssued = refundedNotDisputed.reduce((sum, p) => sum + p.amountPaid + p.creditApplied, 0);
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
