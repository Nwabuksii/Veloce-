import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { saveNoteFile } from "@/lib/storage";
import { runQualityGate } from "@/lib/quality-check";
// @ts-expect-error — pdf-parse ships without its own type declarations
import pdfParse from "pdf-parse";

export const POST = requireRole("SCRIBE", async (req: NextRequest, user) => {
  try {
    const formData = await req.formData();
    const blockId = formData.get("blockId");
    const file = formData.get("file");

    if (typeof blockId !== "string" || !blockId) {
      return NextResponse.json({ error: "blockId is required" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A PDF file is required" }, { status: 400 });
    }
    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Only PDF files are accepted" }, { status: 400 });
    }

    const block = await prisma.block.findUnique({ where: { id: blockId } });
    if (!block) {
      return NextResponse.json({ error: "Block not found" }, { status: 404 });
    }

    // If this block was created to fulfill a demand-feed request, tag the
    // note with it so buyers who voted for it can get their discount.
    const fulfilledRequest = await prisma.blockRequest.findFirst({
      where: { blockId: block.id, status: "FULFILLED" },
    });

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await pdfParse(buffer);
    const extractedText: string = parsed.text || "";

    // Compare against every existing live/flagged note in the SAME block —
    // this is what catches someone re-uploading an existing scribe's work.
    const existingNotes = await prisma.note.findMany({
      where: { blockId, status: { in: ["LIVE", "FLAGGED"] } },
      select: { extractedText: true },
    });

    const result = runQualityGate(
      extractedText,
      existingNotes.map((n) => n.extractedText || "")
    );

    const storedFilename = await saveNoteFile(buffer, file.name);

    const note = await prisma.note.create({
      data: {
        blockId,
        scribeId: user.sub,
        fileUrl: storedFilename,
        extractedText,
        similarityScore: result.maxSimilarity,
        qualityScore: result.qualityScore,
        flaggedForReview: result.flagged,
        fulfillsRequestId: fulfilledRequest?.id,
        status: result.flagged ? "FLAGGED" : "LIVE",
      },
    });

    return NextResponse.json({
      note: { id: note.id, status: note.status },
      message: result.flagged
        ? "Uploaded — flagged for admin review before it goes live."
        : "Uploaded and live!",
    });
  } catch (err) {
    console.error("Scribe upload failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Upload failed: ${message}` }, { status: 500 });
  }
});
