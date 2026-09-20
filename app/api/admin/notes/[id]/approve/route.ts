import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { notifyFollowersOfNewNote } from "@/lib/notify-followers";

interface RouteContext {
  params: { id: string };
}

export const POST = requireRole<RouteContext>("ADMIN", async (req: NextRequest, adminUser, ctx) => {
  const note = await prisma.note.findUnique({
    where: { id: ctx.params.id },
    include: {
      scribe: { select: { universityId: true } },
      block: { select: { title: true } },
    },
  });

  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  // Was missing entirely — any admin, from any university, could approve
  // a flagged note belonging to a completely different university just by
  // knowing/guessing its id. Every other admin/[id] route in this app
  // checks this; this one and reject/route.ts didn't.
  if (note.scribe.universityId !== adminUser.universityId) {
    return NextResponse.json({ error: "Cannot manage notes outside your university" }, { status: 403 });
  }

  if (note.status !== "FLAGGED" && note.status !== "PENDING_REVIEW") {
    return NextResponse.json({ error: `Note already ${note.status.toLowerCase()}` }, { status: 409 });
  }

  const updated = await prisma.note.update({
    where: { id: note.id },
    data: { status: "LIVE", flaggedForReview: false },
  });

  // The other place a note can reach LIVE — see app/api/scribe/upload for
  // the direct (non-flagged) path.
  await notifyFollowersOfNewNote(note.scribeId, note.block.title);

  return NextResponse.json({ note: updated });
});
