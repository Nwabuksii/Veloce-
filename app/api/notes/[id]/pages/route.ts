import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { checkNoteAccess, markNoteOpened } from "@/lib/note-access";
import { readNoteFile } from "@/lib/storage";
import { getPdfPageCount } from "@/lib/pdf-render";

interface RouteContext {
  params: { id: string };
}

// Just the page count — cheap (reads PDF metadata, doesn't rasterize
// anything) so the viewer can set up its prev/next controls before
// fetching any actual page images.
// requireRole (not the bare getSessionUser) so a banned, deleted or
// signed-out-everywhere account is cut off here exactly as it is on every
// other route — previously these three routes only checked the token
// signature, so a banned user could keep reading everything they'd bought.
export const GET = requireRole<RouteContext>("STUDENT", async (req: NextRequest, user, ctx) => {

  const { note, allowed } = await checkNoteAccess(user, ctx.params.id);
  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }
  if (!allowed) {
    return NextResponse.json({ error: "You don't have access to this note" }, { status: 403 });
  }

  await markNoteOpened(user.sub, note.id);

  let pageCount = note.pageCount;
  if (!pageCount) {
    try {
      const buffer = await readNoteFile(note.fileUrl);
      pageCount = await getPdfPageCount(buffer);
      await prisma.note.update({ where: { id: note.id }, data: { pageCount } });
    } catch (err) {
      // Upload now validates the PDF opens before it can ever go LIVE, but
      // this still guards any note saved before that check existed —
      // surface a clear, expected error instead of an unhandled crash.
      console.error(`Failed to read/render note ${note.id} for page count:`, err);
      return NextResponse.json(
        { error: "This file couldn't be opened — it may not have uploaded correctly. Please contact the scribe or support." },
        { status: 422 }
      );
    }
  }

  return NextResponse.json({ pageCount });
});
