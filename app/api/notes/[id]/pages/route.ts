import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { checkNoteAccess } from "@/lib/note-access";
import { readNoteFile } from "@/lib/storage";
import { getPdfPageCount } from "@/lib/pdf-render";

interface RouteContext {
  params: { id: string };
}

// Just the page count — cheap (reads PDF metadata, doesn't rasterize
// anything) so the viewer can set up its prev/next controls before
// fetching any actual page images.
export async function GET(req: NextRequest, ctx: RouteContext) {
  const user = getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { note, allowed } = await checkNoteAccess(user, ctx.params.id);
  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }
  if (!allowed) {
    return NextResponse.json({ error: "You don't have access to this note" }, { status: 403 });
  }

  let pageCount = note.pageCount;
  if (!pageCount) {
    const buffer = await readNoteFile(note.fileUrl);
    pageCount = await getPdfPageCount(buffer);
    await prisma.note.update({ where: { id: note.id }, data: { pageCount } });
  }

  return NextResponse.json({ pageCount });
}
