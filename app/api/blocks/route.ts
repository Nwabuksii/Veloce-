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
        course: true,
        topics: { orderBy: { order: "asc" } },
        notes: {
          where: { status: "LIVE" },
          select: {
            fulfillsRequestId: true,
            scribeId: true,
            scribe: { select: { fullName: true } },
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

    return {
      id: b.id,
      title: b.title,
      price: b.price,
      discountedPrice: hasFulfillmentPricing ? REQUEST_FULFILLED_PRICE : null,
      courseName: b.course.name,
      courseCode: b.course.code,
      unlocked: purchasedIds.has(b.id),
      topics: b.topics.map((t) => t.title),
      scribeId: scribe?.scribeId ?? null,
      scribeName: scribe?.scribe.fullName ?? null,
      liveNoteCount: b.notes.length,
      ratingAvg: ratings.length ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : null,
      ratingCount: ratings.length,
    };
  });

  return NextResponse.json({ blocks: result });
});
