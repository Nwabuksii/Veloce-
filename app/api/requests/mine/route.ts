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

    // The request row can flip to FULFILLED (and get a blockId) the
    // moment a scribe claims it — before they've actually uploaded and
    // gotten a note LIVE. Only surface fulfilledBlock once there's a
    // real, live note behind it; otherwise this reads as "Fulfilled" with
    // a button that leads nowhere buyable. The frontend already falls
    // back to a "Still open" badge when fulfilledBlock is null.
    return {
      id: v.request.id,
      requestedTitle: v.request.requestedTitle,
      courseCode: v.request.course.code,
      courseName: v.request.course.name,
      status: v.request.status,
      voteCount: v.request.votes.length,
      fulfilledBlock:
        v.request.block && fulfillingNote
          ? { id: v.request.block.id, title: v.request.block.title, price: v.request.block.price, noteId: fulfillingNote.id }
          : null,
    };
  });

  return NextResponse.json({ requests: result });
});
