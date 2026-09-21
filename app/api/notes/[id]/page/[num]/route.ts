import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readNoteFile, saveNotePageImage } from "@/lib/storage";
import { renderPdfPageToImage, stampWatermark } from "@/lib/pdf-render";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; num: string } }
) {
  try {
    const noteId = params.id;
    const pageNum = parseInt(params.num, 10);

    if (isNaN(pageNum) || pageNum < 1) {
      return new NextResponse("Invalid page number", { status: 400 });
    }

    // Fetch the note without attempting to include the non-existent 'author' relation
    const note = await prisma.note.findUnique({
      where: { id: noteId },
    });

    if (!note) {
      return new NextResponse("Note not found", { status: 404 });
    }

    let pageImage = await prisma.notePageImage.findUnique({
      where: {
        noteId_pageNum: { noteId, pageNum },
      },
    });

    let baseImageBuffer: Buffer;

    if (pageImage) {
      baseImageBuffer = await readNoteFile(pageImage.imageUrl);
    } else {
      const pdfBuffer = await readNoteFile(note.fileUrl);
      baseImageBuffer = await renderPdfPageToImage(pdfBuffer, pageNum);

      const savedImageUrl = await saveNotePageImage(noteId, pageNum, baseImageBuffer);
      pageImage = await prisma.notePageImage.create({
        data: {
          noteId,
          pageNum,
          imageUrl: savedImageUrl,
        },
      });
    }

    // Construct watermark text lines using only available note data
    const watermarkLines = [
      note.title || "Veloce Note",
      "PREVIEW ONLY",
    ];

    const watermarkedBuffer = await stampWatermark(baseImageBuffer, watermarkLines);

    return new NextResponse(watermarkedBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    });
  } catch (error: any) {
    console.error("Error generating watermarked page:", error);
    return new NextResponse("Failed to generate page view", { status: 500 });
  }
}
