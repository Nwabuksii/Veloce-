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

// Reports one specific scribe's version of a block, not the block
// generically — an admin reviewing this can jump straight to the exact
// upload in question, even when several scribes wrote competing versions.
export const POST = requireRole<RouteContext>("STUDENT", async (req: NextRequest, user, ctx) => {
  const noteId = ctx.params.id;

  const note = await prisma.note.findUnique({
    where: { id: noteId },
    include: { block: { include: { course: { include: { department: true } } } } },
  });

  if (!note || note.block.course.department.universityId !== user.universityId) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const parsed = reportSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const report = await prisma.report.create({
    data: {
      type: "BLOCK",
      reporterId: user.sub,
      blockId: note.blockId,
      noteId: note.id,
      reason: parsed.data.reason,
    },
  });

  return NextResponse.json({ report });
});
