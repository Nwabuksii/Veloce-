import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const GET = requireRole("SCRIBE", async (req: NextRequest) => {
  const courseId = new URL(req.url).searchParams.get("courseId");

  if (!courseId) {
    return NextResponse.json({ error: "courseId is required" }, { status: 400 });
  }

  const blocks = await prisma.block.findMany({
    where: { courseId },
    select: { id: true, title: true, price: true },
    orderBy: { order: "asc" },
  });

  return NextResponse.json({ blocks });
});

const createBlockSchema = z.object({
  courseId: z.string(),
  title: z.string().min(2),
  topics: z.array(z.string().min(1)).min(3, "Add at least 3 topics"),
  fulfillsRequestId: z.string().optional(),
});

export const POST = requireRole("SCRIBE", async (req: NextRequest) => {
  const body = await req.json();
  const parsed = createBlockSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const course = await prisma.course.findUnique({ where: { id: parsed.data.courseId } });
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  // If the scribe picked an open request to fulfill, validate it belongs to
  // this course and is still open before we touch anything.
  let blockRequest = null;
  if (parsed.data.fulfillsRequestId) {
    blockRequest = await prisma.blockRequest.findUnique({ where: { id: parsed.data.fulfillsRequestId } });
    if (!blockRequest || blockRequest.courseId !== course.id) {
      return NextResponse.json({ error: "Request not found for this course" }, { status: 404 });
    }
    if (blockRequest.status !== "OPEN") {
      return NextResponse.json({ error: "This request has already been fulfilled" }, { status: 409 });
    }
  }

  const existingCount = await prisma.block.count({ where: { courseId: course.id } });

  const block = await prisma.block.create({
    data: {
      courseId: course.id,
      title: parsed.data.title,
      order: existingCount + 1,
      price: 1000,
      topics: {
        create: parsed.data.topics.map((title, i) => ({ title, order: i + 1 })),
      },
    },
    include: { topics: true },
  });

  if (blockRequest) {
    await prisma.blockRequest.update({
      where: { id: blockRequest.id },
      data: { blockId: block.id, status: "FULFILLED" },
    });

    const voters = await prisma.requestVote.findMany({
      where: { requestId: blockRequest.id },
      select: { studentId: true },
    });

    if (voters.length > 0) {
      await prisma.adminMessage.createMany({
        data: voters.map((v) => ({
          recipientId: v.studentId,
          senderId: null,
          subject: `Your request was fulfilled — "${block.title}"`,
          body: `Good news — "${blockRequest!.requestedTitle}" for ${course.code} now has notes available: "${block.title}". Head to the block to check it out.`,
        })),
      });
    }
  }

  return NextResponse.json({ block });
});
