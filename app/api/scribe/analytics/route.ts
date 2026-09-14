import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { computeTrustLevel } from "@/lib/trust-level";
import { computeScribeCut, REFUND_WINDOW_MINUTES } from "@/lib/pricing";

// Next-tier thresholds mirrored from lib/trust-level.ts — kept here only for
// showing "X more sales" progress messaging, never for deciding the actual
// level (that's still computeTrustLevel's job alone, so the two can never
// disagree with each other).
const TIER_THRESHOLDS = {
  RISING: { sales: 5, rating: 3.5 },
  TRUSTED: { sales: 20, rating: 4.0 },
  ELITE: { sales: 50, rating: 4.5 },
} as const;

export const GET = requireRole("SCRIBE", async (req: NextRequest, user) => {
  const holdCutoff = new Date(Date.now() - REFUND_WINDOW_MINUTES * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  const notes = await prisma.note.findMany({
    where: { scribeId: user.sub },
    include: {
      block: { include: { course: true } },
      reviews: { select: { rating: true } },
      purchases: {
        where: { refundedAt: null },
        select: { amountPaid: true, redeemedWithCoupon: true, scribeCutOverride: true, purchasedAt: true },
      },
    },
  });

  const allRatings = notes.flatMap((n) => n.reviews.map((r) => r.rating));
  const avgRating = allRatings.length > 0 ? allRatings.reduce((s, r) => s + r, 0) / allRatings.length : null;
  const totalReviews = allRatings.length;
  const hasRejectedNote = notes.some((n) => n.status === "REJECTED");

  let totalSales = 0;
  let totalEarnings = 0;
  let pendingEarnings = 0;
  let salesLast30 = 0;
  let salesPrev30 = 0;

  const cutFor = (p: { amountPaid: number; redeemedWithCoupon: boolean; scribeCutOverride: number | null }, isFulfillment: boolean) =>
    p.redeemedWithCoupon ? p.scribeCutOverride ?? 0 : computeScribeCut(p.amountPaid, isFulfillment);

  const byBlock = notes
    .map((n) => {
      const isFulfillment = Boolean(n.fulfillsRequestId);
      let earnings = 0;
      let pending = 0;
      const noteRatings = n.reviews.map((r) => r.rating);
      const noteAvgRating = noteRatings.length > 0 ? noteRatings.reduce((s, r) => s + r, 0) / noteRatings.length : null;

      for (const p of n.purchases) {
        totalSales += 1;
        const cut = cutFor(p, isFulfillment);
        if (p.purchasedAt <= holdCutoff) {
          totalEarnings += cut;
          earnings += cut;
        } else {
          pendingEarnings += cut;
          pending += cut;
        }
        if (p.purchasedAt >= thirtyDaysAgo) salesLast30 += 1;
        else if (p.purchasedAt >= sixtyDaysAgo) salesPrev30 += 1;
      }

      return {
        blockId: n.block.id,
        blockTitle: n.block.title,
        courseCode: n.block.course.code,
        salesCount: n.purchases.length,
        earnings,
        pending,
        avgRating: noteAvgRating,
        reviewCount: noteRatings.length,
        status: n.status,
      };
    })
    .filter((b) => b.salesCount > 0 || b.status === "FLAGGED" || b.status === "REJECTED")
    .sort((a, b) => b.salesCount - a.salesCount);

  const trust = computeTrustLevel({ salesCount: totalSales, avgRating, hasRejectedNote });

  // What it actually takes to reach the next tier from here — real numbers,
  // not a vague "keep going". null once at the top tier.
  let nextTier: { label: string; salesNeeded: number; ratingNeeded: number | null } | null = null;
  if (trust.level === "NEW") {
    nextTier = {
      label: "Rising Scribe",
      salesNeeded: Math.max(0, TIER_THRESHOLDS.RISING.sales - totalSales),
      ratingNeeded: avgRating !== null && avgRating >= TIER_THRESHOLDS.RISING.rating ? null : TIER_THRESHOLDS.RISING.rating,
    };
  } else if (trust.level === "RISING") {
    nextTier = {
      label: "Trusted Scribe",
      salesNeeded: Math.max(0, TIER_THRESHOLDS.TRUSTED.sales - totalSales),
      ratingNeeded: avgRating !== null && avgRating >= TIER_THRESHOLDS.TRUSTED.rating ? null : TIER_THRESHOLDS.TRUSTED.rating,
    };
  } else if (trust.level === "TRUSTED") {
    nextTier = {
      label: "Elite Scribe",
      salesNeeded: Math.max(0, TIER_THRESHOLDS.ELITE.sales - totalSales),
      ratingNeeded: avgRating !== null && avgRating >= TIER_THRESHOLDS.ELITE.rating ? null : TIER_THRESHOLDS.ELITE.rating,
    };
  }

  const followerCount = await prisma.follow.count({ where: { scribeId: user.sub } });

  return NextResponse.json({
    trustLevel: trust.level,
    trustLabel: trust.label,
    nextTier,
    hasRejectedNote,
    totalSales,
    salesLast30,
    salesPrev30,
    avgRating,
    totalReviews,
    totalEarnings,
    pendingEarnings,
    followerCount,
    byBlock,
  });
});
