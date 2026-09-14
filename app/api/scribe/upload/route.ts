import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { saveNoteFile } from "@/lib/storage";
import { runQualityGate } from "@/lib/quality-check";
// @ts-expect-error — pdf-parse ships without its own type declarations
import pdfParse from "pdf-parse";

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
const MAX_PDF_PAGES = 300;
const PDF_MAGIC_BYTES = Buffer.from("%PDF-", "ascii");

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
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File is too large — max ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB` },
        { status: 400 }
      );
    }

    const block = await prisma.block.findUnique({ where: { id: blockId } });
    if (!block) {
      return NextResponse.json({ error: "Block not found" }, { status: 404 });
    }

    // If this block was created to fulfill a demand-feed request, tag the
    // note with it so it always sells at the fixed request-fulfillment
    // price (see lib/pricing.ts), for any buyer — not just those who voted.
    const fulfilledRequest = await prisma.blockRequest.findFirst({
      where: { blockId: block.id, status: "FULFILLED" },
    });

    const buffer = Buffer.from(await file.arrayBuffer());

    // A client can claim any Content-Type it likes for a form field — this
    // checks the file actually starts with a real PDF header, not just
    // that it was labeled "application/pdf".
    if (!buffer.subarray(0, 5).equals(PDF_MAGIC_BYTES)) {
      return NextResponse.json({ error: "This doesn't look like a real PDF file" }, { status: 400 });
    }

    let parsed;
    try {
      parsed = await pdfParse(buffer);
    } catch (parseErr) {
      // The library's own error text ("Invalid PDF structure" etc.) means
      // nothing to a student — it's genuinely a real, valid PDF that opens
      // fine in a normal viewer, just structured in a way this specific
      // text-extraction library can't read. Re-saving through a different
      // tool (print-to-PDF, or re-export from Word/Docs) normalizes the
      // structure and almost always fixes it — that's the actionable fix,
      // so that's what the person sees, not the library internals.
      console.error("Scribe upload: PDF parsing failed", parseErr);
      Sentry.captureException(parseErr, { extra: { context: "scribe-upload-pdf-parse", userId: user.sub } });
      return NextResponse.json(
        {
          error:
            "We couldn't read this PDF's content. It may still open fine in a normal PDF viewer, but this file's internal structure isn't one we can extract text from. Try re-saving it — e.g. open it and use \"Print → Save as PDF\", or re-export it from Word/Google Docs — then upload that version.",
        },
        { status: 400 }
      );
    }
    const extractedText: string = parsed.text || "";

    if (parsed.numpages > MAX_PDF_PAGES) {
      return NextResponse.json(
        { error: `PDF has too many pages (${parsed.numpages}) — max ${MAX_PDF_PAGES}. Split it into smaller blocks.` },
        { status: 400 }
      );
    }

    // Compare against every existing live/flagged note across the WHOLE
    // university, not just this one block — a note only ever being checked
    // against its own block meant creating a new block (any scribe can, any
    // title) with zero existing notes always starts the similarity check
    // from empty, so re-uploading the exact same PDF under a fresh block
    // title slipped past undetected. Same university-wide scope already
    // used everywhere else in this app for isolation between universities.
    const existingNotes = await prisma.note.findMany({
      where: {
        status: { in: ["LIVE", "FLAGGED"] },
        block: { course: { department: { universityId: user.universityId } } },
      },
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
    Sentry.captureException(err, { extra: { context: "scribe-upload-general", userId: user.sub } });
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Upload failed: ${message}` }, { status: 500 });
  }
});
