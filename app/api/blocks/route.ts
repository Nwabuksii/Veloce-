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

  const [blocks, purchases] = await Promise.all([
    prisma.block.findMany({
      where: {
        course: {
          department: { universityId: user.universityId },
          ...(courseId ? { id: courseId } : {}),
          ...(departmentId ? { departmentId } : {}),
        },
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
          select: { fulfillsRequestId: true, scribeId: true, scribe: { select: { fullName: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ courseId: "asc" }, { order: "asc" }],
    }),
    prisma.purchase.findMany({
      where: { buyerId: user.sub, refundedAt: null },
      select: { blockId: true },
    }),
  ]);

  const purchasedIds = new Set(purchases.map((p) => p.blockId));

  const result = blocks.map((b) => {
    // Fixed pricing now applies to every buyer of a request-fulfilling
    // note, not just students who voted for that specific request — see
    // lib/pricing.ts. This is still a block-level approximation: if a
    // block has several scribe versions and only some fulfill a request,
    // the exact price still depends on which version gets bought, same
    // as before.
    const hasFulfillmentPricing = b.notes.some((n) => n.fulfillsRequestId);
    const scribe = b.notes[0];

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
    };
  });

  return NextResponse.json({ blocks: result });
});
