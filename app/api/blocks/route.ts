import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { REQUEST_FULFILLED_PRICE } from "@/lib/pricing";

// Returns blocks within the student's own university, with an "unlocked"
// flag based on whether they've already purchased it, and a "discountEligible"
// flag for anyone who voted on the request this block's live note fulfills.
// Supports optional filtering: ?q= (matches block title, topics, or course
// name/code), ?courseId=, ?departmentId= (department filter is here for when
// courses stop all living under "General" — see scribe/courses/route.ts).
export const GET = requireRole("STUDENT", async (req: NextRequest, user) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const courseId = url.searchParams.get("courseId");
  const departmentId = url.searchParams.get("departmentId");
  const level = url.searchParams.get("level")?.trim();

  const [blocks, purchases, myVotes] = await Promise.all([
    prisma.block.findMany({
      where: {
        course: {
          department: { universityId: user.universityId },
          ...(courseId ? { id: courseId } : {}),
          ...(departmentId ? { departmentId } : {}),
        },
        // A block exists as soon as a scribe names it (step 2 of the upload
        // wizard) — the actual file only lands in step 3. If a scribe
        // abandons the flow after step 2 (closes the tab, loses
        // connection, gets flagged/rejected by the quality gate), the
        // block would otherwise sit here with nothing purchasable behind
        // it: a student clicks in, sees "No live notes for this topic
        // yet," and can't buy. Requiring at least one LIVE note keeps
        // those out of browse/search entirely until there's really
        // something to sell.
        notes: { some: { status: "LIVE" } },
        ...(level ? { level: { equals: level } } : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { topics: { some: { title: { contains: q, mode: "insensitive" } } } },
                { course: { name: { contains: q, mode: "insensitive" } } },
                { course: { code: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      include: {
        course: { include: { department: { include: { university: true } } } },
        topics: { orderBy: { order: "asc" } },
        purchases: { select: { id: true } },
        notes: {
          where: { status: "LIVE" },
          select: {
            id: true,
            fulfillsRequestId: true,
            scribeId: true,
            scribe: { select: { fullName: true } },
            scribeLevelAtUpload: true,
            reviews: { select: { rating: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ courseId: "asc" }, { order: "asc" }],
    }),
    prisma.purchase.findMany({
      where: { buyerId: user.sub, refundedAt: null },
      select: { blockId: true },
    }),
    // Which requests THIS student actually asked for — the fixed
    // fulfillment price is a thank-you for the person(s) who requested it,
    // not a discount for every future buyer of that block. See lib/pricing.ts.
    prisma.requestVote.findMany({
      where: { studentId: user.sub },
      select: { requestId: true },
    }),
  ]);

  const purchasedIds = new Set(purchases.map((p) => p.blockId));
  const myRequestIds = new Set(myVotes.map((v) => v.requestId));

  const result = blocks.map((b) => {
    // Block-level approximation: if this block has several scribe versions
    // and only some fulfill a request this student voted for, the exact
    // price still depends on which version gets bought — same caveat as
    // before, just now also gated on "did THIS student ask for it".
    const hasFulfillmentPricing = b.notes.some((n) => n.fulfillsRequestId && myRequestIds.has(n.fulfillsRequestId));
    const scribe = b.notes[0];
    // Block-level rating for the catalog card: every review across all of
    // this block's live versions, so a block with competing uploads shows
    // one combined score (each version's own rating is on the block page).
    const ratings = b.notes.flatMap((n) => n.reviews.map((r) => r.rating));
    const featuredNote = b.notes.reduce<
      { noteId: string; score: number; reviews: number } | null
    >((best, n) => {
      const noteScore = n.reviews.reduce((sum, r) => sum + r.rating, 0) / Math.max(1, n.reviews.length);
      const candidate = { noteId: n.id, score: noteScore, reviews: n.reviews.length };
      if (!best) return candidate;
      if (candidate.reviews !== best.reviews) return candidate.reviews > best.reviews ? candidate : best;
      return candidate.score > best.score ? candidate : best;
    }, null);

    return {
      id: b.id,
      title: b.title,
      price: b.price,
      discountedPrice: hasFulfillmentPricing ? REQUEST_FULFILLED_PRICE : null,
      courseName: b.course.name,
      courseCode: b.course.code,
      universityName: b.course.department.university.name,
      level: b.level ?? null,
      unlocked: purchasedIds.has(b.id),
      topics: b.topics.map((t) => t.title),
      moderationStatus: b.moderationStatus ?? "NORMAL",
      purchaseCount: b.purchases.length,
      featuredNoteId: featuredNote?.noteId ?? b.notes[0]?.id ?? null,
      scribeId: scribe?.scribeId ?? null,
      scribeName: scribe?.scribe.fullName ?? null,
      // The featured/first version's own level snapshot (see
      // prisma/schema.prisma Note.scribeLevelAtUpload) — one label per
      // card, matching how scribeName above already picks a single
      // representative version when a block has several.
      scribeLevel: scribe?.scribeLevelAtUpload ?? null,
      liveNoteCount: b.notes.length,
      ratingAvg: ratings.length ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : null,
      ratingCount: ratings.length,
    };
  });

  // This response is personalized per logged-in student because the request-
  // fulfillment discount depends on the current user's vote history. Caching
  // it as a shared/public response causes one account's discount state to leak
  // into another user's dashboard until a later refresh.
  const response = NextResponse.json({ blocks: result });
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  return response;
});
