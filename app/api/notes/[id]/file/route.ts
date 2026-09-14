import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { readNoteFile } from "@/lib/storage";

interface RouteContext {
  params: { id: string };
}

// Now that auth lives in an httpOnly cookie, a plain link clicked in a new
// tab sends it automatically (same-origin, SameSite=Lax covers top-level
// navigation) — no more need to smuggle the token through a ?token= query
// param, which was a URL-leak risk anyway (URLs get logged/cached/shared).
export async function GET(req: NextRequest, ctx: RouteContext) {
  const user = getSessionUser(req);

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const note = await prisma.note.findUnique({ where: { id: ctx.params.id } });
  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const isOwner = note.scribeId === user.sub;
  const isAdmin = user.role === "ADMIN";

  const purchased =
    isOwner || isAdmin
      ? true
      : Boolean(await prisma.purchase.findFirst({ where: { buyerId: user.sub, noteId: note.id } }));

  if (!purchased) {
    return NextResponse.json({ error: "You don't have access to this file" }, { status: 403 });
  }

  let buffer: Buffer;
  try {
    buffer = await readNoteFile(note.fileUrl);
  } catch (err) {
    console.error(`Failed to read file for note ${note.id}:`, err);
    return NextResponse.json(
      { error: "This file couldn't be opened — it may not have uploaded correctly. Please contact the scribe or support." },
      { status: 422 }
    );
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="note-${note.id}.pdf"`,
    },
  });
}
