import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// Feed of open requests, ranked by demand — this is what scribes browse
// to see what students actually want, highest demand first.
export const GET = requireRole("STUDENT", async (req: NextRequest, user) => {
  const courseId = new URL(req.url).searchParams.get("courseId");

  const requests = await prisma.blockRequest.findMany({
    where: {
      status: "OPEN",
      course: { department: { universityId: user.universityId } },
      ...(courseId ? { courseId } : {}),
    },
    include: { course: true, votes: true },
    orderBy: { createdAt: "desc" },
  });

  const result = requests
    .map((r) => ({
      id: r.id,
      requestedTitle: r.requestedTitle,
      courseCode: r.course.code,
      courseId: r.courseId,
      courseName: r.course.name,
      voteCount: r.votes.length,
      requestedByMe: r.votes.some((v) => v.studentId === user.sub),
    }))
    .sort((a, b) => b.voteCount - a.voteCount);

  return NextResponse.json({ requests: result });
});

const createRequestSchema = z.object({
  courseId: z.string(),
  requestedTitle: z.string().min(3),
});

export const POST = requireRole("STUDENT", async (req: NextRequest, user) => {
  const body = await req.json();
  const parsed = createRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const normalized = parsed.data.requestedTitle.trim();

  const course = await prisma.course.findUnique({ where: { id: parsed.data.courseId } });
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  // Auto-grouping: reuse an existing OPEN request for the same course +
  // (near enough) the same wording, instead of creating a duplicate card.
  let request = await prisma.blockRequest.findFirst({
    where: {
      courseId: course.id,
      status: "OPEN",
      requestedTitle: { equals: normalized, mode: "insensitive" },
    },
  });

  if (!request) {
    request = await prisma.blockRequest.create({
      data: { courseId: course.id, requestedTitle: normalized },
    });
  }

  // Add this student's vote — duplicate votes are prevented by the
  // (requestId, studentId) unique constraint, so a repeat request just
  // silently counts as "still want this" rather than erroring.
  try {
    await prisma.requestVote.create({ data: { requestId: request.id, studentId: user.sub } });
  } catch {
    // already voted — fine, no-op
  }

  const voteCount = await prisma.requestVote.count({ where: { requestId: request.id } });

  return NextResponse.json({ request: { id: request.id, requestedTitle: request.requestedTitle, voteCount } });
});
