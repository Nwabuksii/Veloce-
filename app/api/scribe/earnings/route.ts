import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { SCRIBE_SHARE } from "@/lib/pricing";

// Deliberately returns only a final earnings figure per block, never the
// underlying split percentage, never a per-purchase breakdown, and never
// buyer identity — scribes see their own total go up, not who bought what
// or how the number was calculated.
export const GET = requireRole("SCRIBE", async (req: NextRequest, user) => {
  const notes = await prisma.note.findMany({
    where: { scribeId: user.sub },
    include: {
      block: { include: { course: true } },
      purchases: { select: { amountPaid: true } },
    },
  });

  let totalEarnings = 0;
  let totalSales = 0;

  const byBlock = notes
    .map((n) => {
      const salesCount = n.purchases.length;
      const earnings = Math.round(n.purchases.reduce((sum, p) => sum + p.amountPaid, 0) * SCRIBE_SHARE);
      totalEarnings += earnings;
      totalSales += salesCount;

      return {
        blockId: n.block.id,
        blockTitle: n.block.title,
        courseCode: n.block.course.code,
        salesCount,
        earnings,
      };
    })
    .filter((b) => b.salesCount > 0)
    .sort((a, b) => b.earnings - a.earnings);

  return NextResponse.json({ totalEarnings, totalSales, byBlock });
});
