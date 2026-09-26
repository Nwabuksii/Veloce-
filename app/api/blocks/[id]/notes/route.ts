import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { computeTrustLevel } from "@/lib/trust-level";
import { getEffectivePriceForNote } from "@/lib/pricing";

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
      course: { include: { department: { include: { university: true } } } },
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
  const [salesByScribe, ratingsByScribe, rejectedByScribe, myPurchases] = await Promise.all([
    prisma.purchase.findMany({
      where: { note: { scribeId: { in: scribeIds } } },
      select: { noteId: true, note: { select: { scribeId: true } } },
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
  ]);

  const purchaseByNoteId = new Map(myPurchases.map((p) => [p.noteId, p]));
  const fulfilledRequestIds = block.notes
    .map((n) => n.fulfillsRequestId)
    .filter((id): id is string => Boolean(id));
  const myRequestVotes = fulfilledRequestIds.length
    ? await prisma.requestVote.findMany({
        where: { requestId: { in: fulfilledRequestIds }, studentId: user.sub },
        select: { requestId: true },
      })
    : [];
  const myVotedRequestIds = new Set(myRequestVotes.map((v) => v.requestId));

  const salesCountByScribe = new Map<string, number>();
  // Per VERSION, not per scribe — a scribe's second upload of the same
  // block starts its own count at zero rather than inheriting the sales
  // of their earlier version. Kept separate from salesCountByScribe above,
  // which is deliberately still scribe-wide (it feeds the trust badge,
  // an overall-reputation number that's correct to keep cumulative).
  const salesCountByNote = new Map<string, number>();
  for (const p of salesByScribe) {
    salesCountByScribe.set(p.note.scribeId, (salesCountByScribe.get(p.note.scribeId) ?? 0) + 1);
    salesCountByNote.set(p.noteId, (salesCountByNote.get(p.noteId) ?? 0) + 1);
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
      // Snapshotted at upload time — see prisma/schema.prisma
      // Note.scribeLevelAtUpload for why this isn't just a live read of
      // the scribe's current level.
      scribeLevel: n.scribeLevelAtUpload,
      trustLevel: trust.level,
      trustLabel: trust.label,
      noteAvgRating,
      noteRatingCount,
      uploadedAt: n.createdAt,
      // Specs shown in the version-inspector accordion on the block page —
      // deliberately nothing from the file's actual content (that stays
      // gated behind purchase; see lib/note-access.ts), just metadata a
      // buyer can use to judge a version before paying for it.
      pageCount: n.pageCount,
      attestedOriginal: n.attestedOriginal,
      // How many people bought THIS version specifically — see
      // salesCountByNote above. Distinct from the scribe's overall
      // trust-badge sales count, which stays cumulative across all their
      // notes on purpose.
      purchaseCount: salesCountByNote.get(n.id) ?? 0,
      owned: Boolean(myPurchase),
      purchaseId: myPurchase?.id ?? null,
      myReview: myPurchase?.review ? { rating: myPurchase.review.rating, comment: myPurchase.review.comment } : null,
      // The actual charge depends on whether the viewing student voted for
      // that request. A non-requester still pays the block's regular price,
      // and the payment route enforces the same logic in one place.
      price: getEffectivePriceForNote({
        basePrice: block.price,
        fulfillsRequestId: n.fulfillsRequestId,
        buyerVotedForRequest: myVotedRequestIds.has(n.fulfillsRequestId ?? ""),
      }),
      // Only a buyer who actually requested this block before publication
      // should see the fixed-request price label.
      isRequestFulfillment: Boolean(n.fulfillsRequestId && myVotedRequestIds.has(n.fulfillsRequestId)),
    };
  });

  const response = NextResponse.json({
    blockTitle: block.title,
    price: block.price,
    courseName: block.course.name,
    courseCode: block.course.code,
    departmentName: block.course.department.name,
    universityName: block.course.department.university.name,
    topics: block.topics.map((t) => t.title),
    purchaseCount: block.purchases.length,
    liveNoteCount: block.notes.length,
    avgRating: blockAvgRating,
    ratingCount: allRatings.length,
    notes,
  });

  // This payload is also user-specific because it includes a buyer's request-
  // vote status and whether they already own a note. Never cache it across
  // accounts or browser sessions.
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return response;
});
