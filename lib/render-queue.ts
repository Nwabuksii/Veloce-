import { prisma } from "./prisma";
import { readNoteFile, saveNotePageImage } from "./storage";
import { getPdfPageCount, renderPdfPagesToImages } from "./pdf-render";
import { notifyFollowersOfNewNote } from "./notify-followers";

export function isRenderComplete(pageCount: number, renderedCount: number): boolean {
  if (pageCount <= 0) return true;
  return renderedCount >= pageCount;
}

export async function queueNoteRender(noteId: string): Promise<void> {
  const note = await prisma.note.findUnique({
    where: { id: noteId },
    select: {
      id: true,
      scribeId: true,
      fileUrl: true,
      pageCount: true,
      status: true,
      block: { select: { title: true } },
    },
  });

  if (!note || note.status === "REJECTED" || note.status === "LIVE") return;

  try {
    const pdfBuffer = await readNoteFile(note.fileUrl);
    const pageCount = note.pageCount ?? (await getPdfPageCount(pdfBuffer));

    const renderedPages = await renderPdfPagesToImages(pdfBuffer, pageCount);

    for (const [pageNum, imageBuffer] of renderedPages.entries()) {
      const imageUrl = await saveNotePageImage(note.id, pageNum, imageBuffer);
      await prisma.notePageImage.upsert({
        where: { noteId_pageNum: { noteId: note.id, pageNum } },
        update: { imageUrl },
        create: { noteId: note.id, pageNum, imageUrl },
      });
    }

    const renderedCount = await prisma.notePageImage.count({ where: { noteId: note.id } });
    const complete = isRenderComplete(pageCount, renderedCount);

    const updated = await prisma.note.update({
      where: { id: note.id },
      data: { pageCount, status: complete ? "LIVE" : "RENDERING" },
    });

    if (complete && updated.status === "LIVE") {
      await notifyFollowersOfNewNote(note.scribeId, note.block.title);
    }
  } catch (err) {
    console.error(`PDF render queue failed for note ${noteId}:`, err);
  }
}
