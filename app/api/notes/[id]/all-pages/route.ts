import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { checkNoteAccess } from "@/lib/note-access";
import { readNoteFile } from "@/lib/storage";
import { getPdfPageCount, renderPdfPagesToImages, stampWatermark } from "@/lib/pdf-render";

interface RouteContext {
  params: { id: string };
}

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

  const viewer = await prisma.user.findUnique({
    where: { id: user.sub },
    select: { fullName: true, email: true },
  });

  if (!viewer) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let pageCount = note.pageCount ?? 0;
  if (!pageCount) {
    const pdfBuffer = await readNoteFile(note.fileUrl);
    pageCount = await getPdfPageCount(pdfBuffer);
    await prisma.note.update({ where: { id: note.id }, data: { pageCount } });
  }

  const pdfBuffer = await readNoteFile(note.fileUrl);
  const renderedPages = await renderPdfPagesToImages(pdfBuffer, pageCount);

  const images = await Promise.all(
    Array.from({ length: pageCount }, (_, index) => index + 1).map(async (pageNum) => {
      const baseBuffer = renderedPages.get(pageNum) ?? pdfBuffer;
      const watermarked = await stampWatermark(baseBuffer, [`${viewer.fullName} . ${viewer.email}`]);
      return `data:image/jpeg;base64,${watermarked.toString("base64")}`;
    })
  );

  return NextResponse.json({ images, pageCount });
}
