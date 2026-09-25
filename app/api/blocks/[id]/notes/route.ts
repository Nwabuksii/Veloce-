import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { computeTrustLevel } from "@/lib/trust-level";
import { REQUEST_FULFILLED_PRICE } from "@/lib/pricing";

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
      topics: { orderBy: { order: "asc" } },
      purchases: { select: { id: true } },
      notes: {
        where: { status: "LIVE" },
        include: {
          scribe: { select: { id: true, fullName: true, avatarUrl: true, avatarDisplay: true } },
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
  const [salesByScribe, ratingsByScribe, rejectedByScribe, myPurchases, notePurchaseCounts] = await Promise.all([
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
      where: { buyerId: user.sub, blockId, refundedAt: null },
      select: { id: true, noteId: true, review: { select: { rating: true, comment: true } } },
    }),
    prisma.purchase.groupBy({
      by: ["noteId"],
      where: { noteId: { in: block.notes.map((n) => n.id) }, refundedAt: null },
      _count: { noteId: true },
    }),
  ]);

  const purchaseByNoteId = new Map(myPurchases.map((p) => [p.noteId, p]));
  const purchaseCountByNoteId = new Map(notePurchaseCounts.map((item) => [item.noteId, item._count.noteId]));

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

  const allRatings = block.notes.flatMap((n) => n.reviews.map((r) => r.rating));
  const blockAvgRating = allRatings.length ? allRatings.reduce((s, r) => s + r, 0) / allRatings.length : null;

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

    const myPurchase = purchaseByNoteId.get(n.id);

    return {
      noteId: n.id,
      scribeId: n.scribeId,
      scribeName: n.scribe.fullName,
      scribeAvatarUrl: n.scribe.avatarDisplay === "custom" ? n.scribe.avatarUrl : null,
      trustLevel: trust.level,
      trustLabel: trust.label,
      noteAvgRating,
      noteRatingCount,
      purchaseCount: purchaseCountByNoteId.get(n.id) ?? 0,
      uploadedAt: n.createdAt,
      // Specs shown in the version-inspector accordion on the block page —
      // deliberately nothing from the file's actual content (that stays
      // gated behind purchase; see lib/note-access.ts), just metadata a
      // buyer can use to judge a version before paying for it.
      pageCount: n.pageCount,
      attestedOriginal: n.attestedOriginal,
      owned: Boolean(myPurchase),
      purchaseId: myPurchase?.id ?? null,
      myReview: myPurchase?.review ? { rating: myPurchase.review.rating, comment: myPurchase.review.comment } : null,
      // A note that fulfills a student request is always REQUEST_FULFILLED_PRICE,
      // never the block's normal price — this must match exactly what
      // app/api/payments/initialize/route.ts actually charges, or the page
      // shows one number and collects another.
      price: n.fulfillsRequestId ? REQUEST_FULFILLED_PRICE : block.price,
      isRequestFulfillment: Boolean(n.fulfillsRequestId),
    };
  });

  return NextResponse.json({
    blockTitle: block.title,
    price: block.price,
    courseName: block.course.name,
    courseCode: block.course.code,
    departmentName: block.course.department.name,
    topics: block.topics.map((t) => t.title),
    purchaseCount: block.purchases.length,
    liveNoteCount: block.notes.length,
    avgRating: blockAvgRating,
    ratingCount: allRatings.length,
    notes,
  });
});
