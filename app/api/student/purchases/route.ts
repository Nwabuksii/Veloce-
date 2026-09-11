import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const GET = requireRole("STUDENT", async (req: NextRequest, user) => {
  const purchases = await prisma.purchase.findMany({
    where: { buyerId: user.sub },
    include: {
      block: { include: { course: true } },
      note: { include: { scribe: { select: { fullName: true } } } },
      review: true,
    },
    orderBy: { purchasedAt: "desc" },
  });

  const result = purchases.map((p) => ({
    purchaseId: p.id,
    noteId: p.noteId,
    blockTitle: p.block.title,
    courseCode: p.block.course.code,
    courseName: p.block.course.name,
    scribeId: p.note.scribeId,
    scribeName: p.note.scribe.fullName,
    purchasedAt: p.purchasedAt,
    review: p.review ? { rating: p.review.rating, comment: p.review.comment } : null,
  }));

  return NextResponse.json({ purchases: result });
});
