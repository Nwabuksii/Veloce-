import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

interface RouteContext {
  params: { id: string };
}

const reportSchema = z.object({
  reason: z.string().min(10, "Tell us a bit more — at least 10 characters").max(1000),
});

export const POST = requireRole<RouteContext>("STUDENT", async (req: NextRequest, user, ctx) => {
  const blockId = ctx.params.id;

  const block = await prisma.block.findUnique({
    where: { id: blockId },
    include: { course: { include: { department: true } } },
  });

  if (!block || block.course.department.universityId !== user.universityId) {
    return NextResponse.json({ error: "Block not found" }, { status: 404 });
  }

  const parsed = reportSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const report = await prisma.report.create({
    data: {
      type: "BLOCK",
      reporterId: user.sub,
      blockId,
      reason: parsed.data.reason,
    },
  });

  return NextResponse.json({ report });
});
