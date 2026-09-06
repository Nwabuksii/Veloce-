import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { applyRequestDiscount } from "@/lib/pricing";

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

  const [blocks, purchases, myVotedRequestIds] = await Promise.all([
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
      where: { buyerId: user.sub },
      select: { blockId: true },
    }),
    prisma.requestVote.findMany({
      where: { studentId: user.sub },
      select: { requestId: true },
    }),
  ]);

  const purchasedIds = new Set(purchases.map((p) => p.blockId));
  const votedRequestIds = new Set(myVotedRequestIds.map((v) => v.requestId));

  const result = blocks.map((b) => {
    const discountEligible = b.notes.some(
      (n) => n.fulfillsRequestId && votedRequestIds.has(n.fulfillsRequestId)
    );
    const scribe = b.notes[0];

    return {
      id: b.id,
      title: b.title,
      price: b.price,
      discountedPrice: discountEligible ? applyRequestDiscount(b.price) : null,
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
