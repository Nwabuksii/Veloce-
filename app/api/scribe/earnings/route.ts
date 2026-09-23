import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { computeScribeCut, effectivePrice, REFUND_WINDOW_MINUTES, EARNINGS_HOLD_MINUTES } from "@/lib/pricing";
import { saleStatus } from "@/lib/withdrawal";

// Deliberately returns only a final earnings figure per block, never the
// underlying split percentage, never a per-purchase breakdown, and never
// buyer identity — scribes see their own total go up, not who bought what
// or how the number was calculated. The one exception is the pending/
// confirmed split, which is deliberately visible so a scribe understands
// why a sale they can see happened isn't in their withdrawable total yet —
// including sales "waiting for admin to verify" because the buyer asked
// for a refund (see saleStatus in lib/withdrawal.ts).
export const GET = requireRole("SCRIBE", async (req: NextRequest, user) => {
  const holdCutoff = new Date(Date.now() - EARNINGS_HOLD_MINUTES * 60 * 1000);

  const notes = await prisma.note.findMany({
    where: { scribeId: user.sub },
    include: {
      block: { include: { course: true } },
      purchases: {
        where: { refundedAt: null },
        select: {
          amountPaid: true,
          creditApplied: true,
          purchasedAt: true,
          reports: { where: { type: "REFUND" }, select: { status: true } },
        },
      },
    },
  });

  let totalEarnings = 0;
  let pendingEarnings = 0;
  let totalSales = 0;
  let pendingSales = 0;
  let reviewEarnings = 0;
  let reviewSales = 0;

  const cutFor = (p: { amountPaid: number; creditApplied: number }, isFulfillment: boolean) =>
    computeScribeCut(effectivePrice(p), isFulfillment);

  const byBlock = notes
    .map((n) => {
      const isRequestFulfillment = Boolean(n.fulfillsRequestId);
      let earnings = 0;
      let pending = 0;
      let review = 0;
      let salesCount = 0;
      let pendingCount = 0;
      let reviewCount = 0;

      for (const p of n.purchases) {
        const cut = cutFor(p, isRequestFulfillment);
        const status = saleStatus(p, holdCutoff);
        if (status === "confirmed") {
          earnings += cut;
          salesCount += 1;
        } else if (status === "clearing") {
          pending += cut;
          pendingCount += 1;
        } else {
          review += cut;
          reviewCount += 1;
        }
      }

      totalEarnings += earnings;
      pendingEarnings += pending;
      totalSales += salesCount;
      pendingSales += pendingCount;
      reviewEarnings += review;
      reviewSales += reviewCount;

      return {
        blockId: n.block.id,
        blockTitle: n.block.title,
        courseCode: n.block.course.code,
        salesCount,
        earnings,
        pending,
        pendingCount,
        review,
        reviewCount,
      };
    })
    .filter((b) => b.salesCount > 0 || b.pendingCount > 0 || b.reviewCount > 0)
    .sort((a, b) => b.earnings - a.earnings);

  return NextResponse.json({
    totalEarnings,
    pendingEarnings,
    totalSales,
    pendingSales,
    reviewEarnings,
    reviewSales,
    refundWindowMinutes: REFUND_WINDOW_MINUTES,
    byBlock,
  });
});
