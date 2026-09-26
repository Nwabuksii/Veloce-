import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { saveNoteFile } from "@/lib/storage";
import { runQualityGate } from "@/lib/quality-check";
import { getPdfPageCount } from "@/lib/pdf-render";
import { notifyFollowersOfNewNote } from "@/lib/notify-followers";
// @ts-expect-error — pdf-parse ships without its own type declarations
import pdfParse from "pdf-parse";

const MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024; // 3MB
const MAX_PDF_PAGES = 300;
const PDF_MAGIC_BYTES = Buffer.from("%PDF-", "ascii");

export const POST = requireRole("SCRIBE", async (req: NextRequest, user) => {
  try {
    const formData = await req.formData();
    const blockId = formData.get("blockId");
    const file = formData.get("file");
    const attestedOriginal = formData.get("attestedOriginal");

    if (typeof blockId !== "string" || !blockId) {
      return NextResponse.json({ error: "blockId is required" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A PDF file is required" }, { status: 400 });
    }
    if (attestedOriginal !== "true") {
      return NextResponse.json(
        { error: "You must confirm these are your own original notes before uploading." },
        { status: 400 }
      );
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

    const block = await prisma.block.findUnique({
      where: { id: blockId },
      include: { course: { include: { department: true } } },
    });
    if (!block) {
      return NextResponse.json({ error: "Block not found" }, { status: 404 });
    }
    if (block.course.department.universityId !== user.universityId) {
      return NextResponse.json({ error: "You can only upload to blocks at your own university" }, { status: 403 });
    }

    const scribeProfile = await prisma.user.findUnique({
      where: { id: user.sub },
      select: { level: true, graduatedAt: true },
    });
    if (scribeProfile?.graduatedAt) {
      return NextResponse.json(
        { error: "You've graduated past 500L, so new uploads are closed — your existing notes stay live and still earn." },
        { status: 403 }
      );
    }

    // If this block was created to fulfill a demand-feed request, tag the
    // note with it so buyers who voted for it can get their discount.
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

    let parsed: { text?: string; numpages: number; info?: { Producer?: string; Creator?: string } };
    try {
      parsed = await pdfParse(buffer);
    } catch (err) {
      console.error("pdf-parse failed on upload:", err);
      return NextResponse.json(
        { error: "This PDF looks corrupted or didn't fully upload. Please try uploading it again." },
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

    // pdf-parse is a lenient reader — it can happily return text for a file
    // that's truncated or otherwise malformed and never notice. The actual
    // reading experience renders pages with pdfjs-dist instead (see
    // lib/pdf-render.ts), which is stricter and throws on exactly the kind
    // of broken/incomplete PDF pdf-parse let through above. Without this
    // check, that mismatch was the whole bug: a half-uploaded PDF could
    // sail past pdf-parse, get saved, and go LIVE — only to 500 the moment
    // a buyer actually tried to open it. Running the real renderer's own
    // "can I even open this" check here, before anything is saved or goes
    // live, catches it up front instead.
    let pageCount: number;
    try {
      pageCount = await getPdfPageCount(buffer);
    } catch (err) {
      console.error("PDF failed render validation on upload:", err);
      return NextResponse.json(
        { error: "This PDF looks corrupted or didn't fully upload. Please try uploading it again." },
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
      existingNotes.map((n) => n.extractedText || ""),
      parsed.info
    );

    // A scribe's very first upload is the riskiest moment — they haven't
    // proven anything yet, and the automated checks above only catch
    // specific patterns (too short, duplicate, slide-tool metadata), not
    // "genuinely unproven scribe." Force it into manual review regardless
    // of what the automated gate found, on top of whatever it already did.
    const priorUploadCount = await prisma.note.count({ where: { scribeId: user.sub } });
    const reasons = [...result.reasons];
    if (priorUploadCount === 0) {
      reasons.push("First upload from this scribe — manual review required");
    }
    const flagged = result.flagged || priorUploadCount === 0;

    const storedFilename = await saveNoteFile(buffer, file.name);

    const note = await prisma.note.create({
      data: {
        blockId,
        scribeId: user.sub,
        fileUrl: storedFilename,
        extractedText,
        pageCount,
        similarityScore: result.maxSimilarity,
        qualityScore: result.qualityScore,
        flaggedForReview: flagged,
        flagReason: reasons.length > 0 ? reasons.join("; ") : null,
        attestedOriginal: true,
        fulfillsRequestId: fulfilledRequest?.id,
        status: flagged ? "FLAGGED" : "LIVE",
        scribeLevelAtUpload: scribeProfile?.level ?? null,
      },
    });

    // Only when it's actually visible to anyone — a flagged upload still
    // needs admin approval first (see the approve route for that path).
    if (!flagged) {
      await notifyFollowersOfNewNote(user.sub, block.title);
    }

    return NextResponse.json({
      note: { id: note.id, status: note.status },
      message: flagged
        ? "Uploaded — flagged for admin review before it goes live."
        : "Uploaded and live!",
    });
  } catch (err) {
    console.error("Scribe upload failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Upload failed: ${message}` }, { status: 500 });
  }
});
