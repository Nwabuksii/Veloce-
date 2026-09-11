import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

interface RouteContext {
  params: { id: string };
}

// Deliberately NOT gated by purchase or ownership — the whole point is
// letting a student read what others thought before they buy, same as
// after. Reviewer identity is never included, same privacy stance as the
// aggregate rating shown elsewhere in the app.
export const GET = requireRole<RouteContext>("STUDENT", async (req: NextRequest, user, ctx) => {
  const note = await prisma.note.findUnique({ where: { id: ctx.params.id } });
  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const reviews = await prisma.review.findMany({
    where: { noteId: note.id },
    select: { rating: true, comment: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ reviews });
});
