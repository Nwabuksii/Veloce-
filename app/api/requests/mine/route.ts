import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const GET = requireRole("STUDENT", async (req: NextRequest, user) => {
  const votes = await prisma.requestVote.findMany({
    where: { studentId: user.sub },
    include: {
      request: {
        include: {
          course: true,
          votes: true,
          block: true,
          claims: { where: { status: "LIVE" }, select: { id: true, blockId: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const result = votes.map((v) => {
    const fulfillingNote = v.request.block
      ? v.request.claims.find((n) => n.blockId === v.request.blockId)
      : null;

    return {
      id: v.request.id,
      requestedTitle: v.request.requestedTitle,
      courseCode: v.request.course.code,
      courseName: v.request.course.name,
      status: v.request.status,
      voteCount: v.request.votes.length,
      fulfilledBlock: v.request.block
        ? { id: v.request.block.id, title: v.request.block.title, price: v.request.block.price, noteId: fulfillingNote?.id ?? null }
        : null,
    };
  });

  return NextResponse.json({ requests: result });
});
