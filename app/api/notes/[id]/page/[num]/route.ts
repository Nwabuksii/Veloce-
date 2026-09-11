import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { checkNoteAccess } from "@/lib/note-access";
import { readNoteFile, saveNotePageImage } from "@/lib/storage";
import { getPdfPageCount, renderPdfPageToImage, stampWatermark } from "@/lib/pdf-render";

interface RouteContext {
  params: { id: string; num: string };
}

// This is the only way page content is ever served now — the old raw-file
// route is gone. Every response here is unique per viewer (their name/email
// baked into the image), so it must NEVER be cached by a browser, proxy, or
// CDN and handed to a different person.
export async function GET(req: NextRequest, ctx: RouteContext) {
  const user = getSessionUser(req);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const pageNum = parseInt(ctx.params.num, 10);
  if (!Number.isInteger(pageNum) || pageNum < 1) {
    return NextResponse.json({ error: "Invalid page number" }, { status: 400 });
  }

  const { note, allowed } = await checkNoteAccess(user, ctx.params.id);
  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }
  if (!allowed) {
    return NextResponse.json({ error: "You don't have access to this note" }, { status: 403 });
  }

  const viewer = await prisma.user.findUnique({
    where: { id: user.sub },
    select: { fullName: true, email: true },
  });
  if (!viewer) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Look for an already-rendered base image for this exact page first —
  // this is the expensive step we only ever want to do once per page.
  let pageImage = await prisma.notePageImage.findUnique({
    where: { noteId_pageNum: { noteId: note.id, pageNum } },
  });

  let baseImageBuffer: Buffer;

  if (pageImage) {
    baseImageBuffer = await readNoteFile(pageImage.imageUrl); // generic fetch-by-url despite the name
  } else {
    const pdfBuffer = await readNoteFile(note.fileUrl);

    if (!note.pageCount) {
      const pageCount = await getPdfPageCount(pdfBuffer);
      await prisma.note.update({ where: { id: note.id }, data: { pageCount } });
    }

    baseImageBuffer = await renderPdfPageToImage(pdfBuffer, pageNum);
    const imageUrl = await saveNotePageImage(note.id, pageNum, baseImageBuffer);

    // Someone else may have rendered + cached this exact page in the tiny
    // window since our findUnique above — @@unique([noteId, pageNum]) means
    // the loser here just quietly keeps using its own freshly-rendered
    // buffer instead of erroring, since the pixels are identical either way.
    try {
      pageImage = await prisma.notePageImage.create({
        data: { noteId: note.id, pageNum, imageUrl },
      });
    } catch (err: any) {
      if (err?.code !== "P2002") throw err;
    }
  }

  const watermarked = await stampWatermark(baseImageBuffer, [viewer.email, viewer.fullName]);

  return new NextResponse(new Uint8Array(watermarked), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, no-store, no-cache, must-revalidate",
    },
  });
}
