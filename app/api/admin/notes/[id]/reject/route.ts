import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

interface RouteContext {
  params: { id: string };
}

export const POST = requireRole<RouteContext>("ADMIN", async (req: NextRequest, adminUser, ctx) => {
  const note = await prisma.note.findUnique({
    where: { id: ctx.params.id },
    include: { scribe: { select: { universityId: true } } },
  });

  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  // Was missing entirely — see approve/route.ts for why this check exists.
  if (note.scribe.universityId !== adminUser.universityId) {
    return NextResponse.json({ error: "Cannot manage notes outside your university" }, { status: 403 });
  }

  if (note.status !== "FLAGGED" && note.status !== "PENDING_REVIEW") {
    return NextResponse.json({ error: `Note already ${note.status.toLowerCase()}` }, { status: 409 });
  }

  const updated = await prisma.note.update({
    where: { id: note.id },
    data: { status: "REJECTED" },
  });

  return NextResponse.json({ note: updated });
});
