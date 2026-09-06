import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// Everything a scribe needs to see about their own work:
// what they've uploaded, its status, how many sold, and their rating.
export const GET = requireRole("SCRIBE", async (req: NextRequest, user) => {
  const notes = await prisma.note.findMany({
    where: { scribeId: user.sub },
    include: {
      block: { include: { course: true } },
      purchases: { select: { id: true } },
      reviews: { select: { rating: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const result = notes.map((n) => {
    const salesCount = n.purchases.length;
    const avgRating = n.reviews.length ? n.reviews.reduce((sum, r) => sum + r.rating, 0) / n.reviews.length : null;

    return {
      id: n.id,
      status: n.status,
      blockId: n.block.id,
      blockTitle: n.block.title,
      courseCode: n.block.course.code,
      courseName: n.block.course.name,
      salesCount,
      avgRating,
      reviewCount: n.reviews.length,
      createdAt: n.createdAt,
    };
  });

  return NextResponse.json({ notes: result });
});
