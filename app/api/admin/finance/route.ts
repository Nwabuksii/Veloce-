import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { SCRIBE_SHARE, PLATFORM_SHARE } from "@/lib/pricing";

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

  const grossRevenue = purchases.reduce((sum, p) => sum + p.amountPaid, 0);
  const platformRevenue = Math.round(grossRevenue * PLATFORM_SHARE);
  const scribePool = grossRevenue - platformRevenue;

  const recentTransactions = purchases.slice(0, 20).map((p) => ({
    id: p.id,
    buyerName: p.buyer.fullName,
    scribeName: p.note.scribe.fullName,
    blockTitle: p.block.title,
    courseCode: p.block.course.code,
    amountPaid: p.amountPaid,
    discountApplied: p.discountApplied,
    purchasedAt: p.purchasedAt,
  }));

  return NextResponse.json({
    grossRevenue,
    platformRevenue,
    scribePool,
    transactionCount: purchases.length,
    scribeSharePercent: Math.round(SCRIBE_SHARE * 100),
    platformSharePercent: Math.round(PLATFORM_SHARE * 100),
    recentTransactions,
  });
});
