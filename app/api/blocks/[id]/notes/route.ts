import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { computeTrustLevel } from "@/lib/trust-level";

interface RouteContext {
  params: { id: string };
}

// One block can have several scribes' competing notes live at once. This
// lists each one with enough of the scribe's reputation to help a student
// pick, instead of the checkout flow silently auto-selecting the earliest.
export const GET = requireRole<RouteContext>("STUDENT", async (req: NextRequest, user, ctx) => {
  const blockId = ctx.params.id;

  const block = await prisma.block.findUnique({
    where: { id: blockId },
    include: {
      course: { include: { department: true } },
      notes: {
        where: { status: "LIVE" },
        include: {
          scribe: { select: { id: true, fullName: true } },
          reviews: { select: { rating: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!block || block.course.department.universityId !== user.universityId) {
    return NextResponse.json({ error: "Block not found" }, { status: 404 });
  }

  // Overall sales + rating per scribe (across all their notes, not just this
  // one) so the trust badge here matches what shows on their profile page.
  const scribeIds = [...new Set(block.notes.map((n) => n.scribeId))];
  const [salesByScribe, ratingsByScribe, rejectedByScribe, myPurchases] = await Promise.all([
    prisma.purchase.findMany({
      where: { note: { scribeId: { in: scribeIds } } },
      select: { note: { select: { scribeId: true } } },
    }),
    prisma.review.findMany({
      where: { note: { scribeId: { in: scribeIds } } },
      select: { rating: true, note: { select: { scribeId: true } } },
    }),
    prisma.note.findMany({
      where: { scribeId: { in: scribeIds }, status: "REJECTED" },
      select: { scribeId: true },
    }),
    prisma.purchase.findMany({
      where: { buyerId: user.sub, blockId },
      select: { noteId: true },
    }),
  ]);

  const ownedNoteIds = new Set(myPurchases.map((p) => p.noteId));

  const salesCountByScribe = new Map<string, number>();
  for (const p of salesByScribe) {
    salesCountByScribe.set(p.note.scribeId, (salesCountByScribe.get(p.note.scribeId) ?? 0) + 1);
  }
  const ratingsSumByScribe = new Map<string, { sum: number; count: number }>();
  for (const r of ratingsByScribe) {
    const cur = ratingsSumByScribe.get(r.note.scribeId) ?? { sum: 0, count: 0 };
    cur.sum += r.rating;
    cur.count += 1;
    ratingsSumByScribe.set(r.note.scribeId, cur);
  }
  const rejectedScribeIds = new Set(rejectedByScribe.map((n) => n.scribeId));

  const notes = block.notes.map((n) => {
    const noteRatingCount = n.reviews.length;
    const noteAvgRating = noteRatingCount
      ? n.reviews.reduce((s, r) => s + r.rating, 0) / noteRatingCount
      : null;

    const overall = ratingsSumByScribe.get(n.scribeId);
    const trust = computeTrustLevel({
      salesCount: salesCountByScribe.get(n.scribeId) ?? 0,
      avgRating: overall ? overall.sum / overall.count : null,
      hasRejectedNote: rejectedScribeIds.has(n.scribeId),
    });

    return {
      noteId: n.id,
      scribeId: n.scribeId,
      scribeName: n.scribe.fullName,
      trustLevel: trust.level,
      trustLabel: trust.label,
      noteAvgRating,
      noteRatingCount,
      uploadedAt: n.createdAt,
      owned: ownedNoteIds.has(n.id),
    };
  });

  return NextResponse.json({ blockTitle: block.title, price: block.price, notes });
});
