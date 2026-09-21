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

    const note = await prisma.note.findUnique({
      where: { id: noteId },
      include: { author: true },
    });

    if (!note) {
      return new NextResponse("Note not found", { status: 404 });
    }

    // Check if base unwatermarked render already exists in DB
    let pageImage = await prisma.notePageImage.findUnique({
      where: {
        noteId_pageNum: { noteId, pageNum },
      },
    });

    let baseImageBuffer: Buffer;

    if (pageImage) {
      // Fetch base page render from Cloudinary
      baseImageBuffer = await readNoteFile(pageImage.imageUrl);
    } else {
      // Render base PDF page to JPEG
      const pdfBuffer = await readNoteFile(note.fileUrl);
      baseImageBuffer = await renderPdfPageToImage(pdfBuffer, pageNum);

      // Save base image URL to DB for quick re-use
      const savedImageUrl = await saveNotePageImage(noteId, pageNum, baseImageBuffer);
      pageImage = await prisma.notePageImage.create({
        data: {
          noteId,
          pageNum,
          imageUrl: savedImageUrl,
        },
      });
    }

    // Construct watermark text lines
    const watermarkLines = [
      note.title || "Veloce Note",
      note.author?.name ? `By ${note.author.name}` : "",
      "PREVIEW ONLY",
    ];

    // Always stamp watermark on top of base image buffer
    const watermarkedBuffer = await stampWatermark(baseImageBuffer, watermarkLines);

    // Return JPEG directly to client with no-store cache control
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

