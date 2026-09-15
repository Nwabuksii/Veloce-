import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

interface RouteContext {
  params: { id: string };
}

// Toggle the current student's vote on an open block request — same
// add/remove-on-click pattern as /api/scribe/[id]/follow. Clicking a
// request you haven't voted on adds your vote; clicking one you have
// removes it. The request itself (and other students' votes) is
// untouched either way.
export const POST = requireRole<RouteContext>(
  "STUDENT",
  async (req: NextRequest, user, ctx) => {
    const requestId = ctx.params.id;

    const request = await prisma.blockRequest.findUnique({
      where: { id: requestId },
      include: { course: { include: { department: true } } },
    });

    if (!request || request.course.department.universityId !== user.universityId) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    if (request.status !== "OPEN") {
      return NextResponse.json({ error: "This request is no longer open" }, { status: 400 });
    }

    const existing = await prisma.requestVote.findUnique({
      where: { requestId_studentId: { requestId, studentId: user.sub } },
    });

    if (existing) {
      await prisma.requestVote.delete({ where: { id: existing.id } });
    } else {
      await prisma.requestVote.create({ data: { requestId, studentId: user.sub } });
    }

    const voteCount = await prisma.requestVote.count({ where: { requestId } });

    return NextResponse.json({ requestedByMe: !existing, voteCount });
  }
);
