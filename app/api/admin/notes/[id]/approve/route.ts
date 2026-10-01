import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { queueNoteRender } from "@/lib/render-queue";

// Rendering the pages takes a while (up to ~45s for a big PDF). Vercel stops a
// function as soon as it has responded, so the render must finish INSIDE this
// request, and the function needs a time limit long enough for it.
export const maxDuration = 60;

interface RouteContext {
  params: { id: string };
}

export const POST = requireRole<RouteContext>("ADMIN", async (req: NextRequest, adminUser, ctx) => {
  const note = await prisma.note.findUnique({
    where: { id: ctx.params.id },
    include: {
      scribe: { select: { universityId: true } },
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
    data: { status: "RENDERING", flaggedForReview: false },
  });

  // Awaited on purpose: a fire-and-forget render is killed by Vercel the moment
  // this response is sent, which left approved notes stuck and never live.
  // queueNoteRender flips the note to LIVE and notifies followers itself; if
  // rendering fails it puts the note back in this queue with the reason.
  await queueNoteRender(note.id);

  const final = await prisma.note.findUnique({ where: { id: note.id }, select: { id: true, status: true } });
  if (final?.status !== "LIVE") {
    return NextResponse.json(
      { error: "Approved, but the pages could not be rendered, so the note is back in the queue. Try approving again." },
      { status: 502 }
    );
  }

  return NextResponse.json({ note: final ?? updated });
});
