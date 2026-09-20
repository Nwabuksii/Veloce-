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
      reports: { where: { type: "REFUND" }, select: { status: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { purchasedAt: "desc" },
  });

  // Gives the buyer a day or two before nudging — someone who bought five
  // minutes ago clicking away to do something else isn't "neglecting" it.
  const NUDGE_AFTER_MS = 2 * 24 * 60 * 60 * 1000;
  const now = Date.now();

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
    refunded: p.refundedAt !== null,
    amountPaid: p.amountPaid,
    creditApplied: p.creditApplied,
    redeemedWithCoupon: p.redeemedWithCoupon,
    refundRequestStatus: p.reports[0]?.status ?? null,
    unopened:
      p.firstOpenedAt === null && p.refundedAt === null && now - p.purchasedAt.getTime() > NUDGE_AFTER_MS,
  }));

  return NextResponse.json({ purchases: result });
});
