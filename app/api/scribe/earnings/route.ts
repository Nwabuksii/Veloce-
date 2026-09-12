import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { computeScribeCut, REFUND_WINDOW_MINUTES } from "@/lib/pricing";

// Deliberately returns only a final earnings figure per block, never the
// underlying split percentage, never a per-purchase breakdown, and never
// buyer identity — scribes see their own total go up, not who bought what
// or how the number was calculated. The one exception is the pending/
// confirmed split, which is deliberately visible so a scribe understands
// why a sale they can see happened isn't in their withdrawable total yet.
export const GET = requireRole("SCRIBE", async (req: NextRequest, user) => {
  const holdCutoff = new Date(Date.now() - REFUND_WINDOW_MINUTES * 60 * 1000);

  const notes = await prisma.note.findMany({
    where: { scribeId: user.sub },
    include: {
      block: { include: { course: true } },
      purchases: {
        where: { refundedAt: null },
        select: { amountPaid: true, redeemedWithCoupon: true, scribeCutOverride: true, purchasedAt: true },
      },
    },
  });

  let totalEarnings = 0;
  let pendingEarnings = 0;
  let totalSales = 0;
  let pendingSales = 0;

  const cutFor = (p: { amountPaid: number; redeemedWithCoupon: boolean; scribeCutOverride: number | null }, isFulfillment: boolean) =>
    p.redeemedWithCoupon ? p.scribeCutOverride ?? 0 : computeScribeCut(p.amountPaid, isFulfillment);

  const byBlock = notes
    .map((n) => {
      const isRequestFulfillment = Boolean(n.fulfillsRequestId);
      let earnings = 0;
      let pending = 0;
      let salesCount = 0;
      let pendingCount = 0;

      for (const p of n.purchases) {
        const cut = cutFor(p, isRequestFulfillment);
        if (p.purchasedAt <= holdCutoff) {
          earnings += cut;
          salesCount += 1;
        } else {
          pending += cut;
          pendingCount += 1;
        }
      }

      totalEarnings += earnings;
      pendingEarnings += pending;
      totalSales += salesCount;
      pendingSales += pendingCount;

      return {
        blockId: n.block.id,
        blockTitle: n.block.title,
        courseCode: n.block.course.code,
        salesCount,
        earnings,
        pending,
        pendingCount,
      };
    })
    .filter((b) => b.salesCount > 0 || b.pendingCount > 0)
    .sort((a, b) => b.earnings - a.earnings);

  return NextResponse.json({
    totalEarnings,
    pendingEarnings,
    totalSales,
    pendingSales,
    refundWindowMinutes: REFUND_WINDOW_MINUTES,
    byBlock,
  });
});
