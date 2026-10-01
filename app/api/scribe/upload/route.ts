import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { saveNoteFile, deleteNoteFile } from "@/lib/storage";
import { runQualityGate, textFingerprint, MAX_TEXT_CHARS } from "@/lib/quality-check";
import type { Prisma } from "@prisma/client";
import type { FlagDetails, FlagMatch } from "@/lib/flag-reasons";
import { inspectPdf, PdfLimitError } from "@/lib/pdf-render";
import { rateLimitResponse } from "@/lib/rate-limit";
import { withTimeout } from "@/lib/async-limits";
import { notifyFollowersOfNewNote } from "@/lib/notify-followers";
import { queueNoteRender } from "@/lib/render-queue";
// @ts-expect-error — pdf-parse ships without its own type declarations
import pdfParse from "pdf-parse";

const MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024; // 3MB
// Each upload is compared against at most this many recent notes from the
// same course (an identical re-upload anywhere in the university is caught
// by the text fingerprint instead, so this can stay small).
const SIMILARITY_COMPARE_LIMIT = 100;
const UPLOADS_PER_HOUR = 10;
const PDF_PARSE_TIMEOUT_MS = 30_000;
const PDF_MAGIC_BYTES = Buffer.from("%PDF-", "ascii");

// The page render runs inside this request (see queueNoteRender) — Vercel
// would kill it if it were left running after the response.
export const maxDuration = 60;

export const POST = requireRole("SCRIBE", async (req: NextRequest, user) => {
  // First thing, before the body is read: an upload is the most expensive
  // request a scribe can make (parse + validate + compare + store + render).
  const blocked = await rateLimitResponse(
    `scribe-upload:${user.sub}`,
    UPLOADS_PER_HOUR,
    60 * 60 * 1000,
    "You've uploaded a lot in the last hour. Please wait a bit before uploading more."
  );
  if (blocked) return blocked;

  // Refuse an obviously oversized body before buffering it. The headroom is
  // for the multipart envelope; the exact file size is still checked below.
  if (Number(req.headers.get("content-length")) > MAX_FILE_SIZE_BYTES + 512 * 1024) {
    return NextResponse.json(
      { error: `File is too large — max ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB` },
      { status: 413 }
    );
  }

  // Set once the PDF is in storage and cleared once the note row exists, so
  // any failure in between removes the file instead of leaving it orphaned.
  let storedRef: string | null = null;

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
    if (file.type !== "application/pdf" || !/\.pdf$/i.test(file.name)) {
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

    // Open the PDF the way the renderer will, BEFORE the heavier text
    // extraction: enforces the page-count and page-size limits and rejects a
    // corrupt/truncated file up front. (pdf-parse below is a lenient reader
    // that happily returns text for a half-uploaded file — the old bug where
    // such a note went LIVE and then 500'd for every buyer — so pdf.js is
    // the authority on whether the file is really usable.)
    let pageCount: number;
    try {
      ({ pageCount } = await inspectPdf(buffer));
    } catch (err) {
      if (err instanceof PdfLimitError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      console.error("PDF failed render validation on upload:", err);
      return NextResponse.json(
        { error: "This PDF looks corrupted or didn't fully upload. Please try uploading it again." },
        { status: 400 }
      );
    }

    let parsed: { text?: string; numpages: number; info?: { Producer?: string; Creator?: string } };
    try {
      parsed = await withTimeout(pdfParse(buffer), PDF_PARSE_TIMEOUT_MS, "Reading the PDF text");
    } catch (err) {
      console.error("pdf-parse failed on upload:", err);
      return NextResponse.json(
        { error: "This PDF looks corrupted or didn't fully upload. Please try uploading it again." },
        { status: 400 }
      );
    }
    // Capped once here, so what's stored, fingerprinted and compared is the same text.
    const extractedText: string = (parsed.text || "").slice(0, MAX_TEXT_CHARS);
    const textHash = textFingerprint(extractedText);

    // Two cheap checks instead of comparing against every note at the
    // university (which grew with the whole platform and could be used to
    // make each upload cost more and more):
    //  1. one indexed lookup for an IDENTICAL text anywhere in the university
    //     — this is what catches the same PDF re-uploaded under a brand-new
    //     block title, which the old university-wide scan existed to catch;
    //  2. a similarity comparison against only the most recent notes in the
    //     same course, for near-duplicates.
    const universityScope = { course: { department: { universityId: user.universityId } } };
    const [recentNotes, exactDuplicate] = await Promise.all([
      prisma.note.findMany({
        where: { status: { in: ["LIVE", "FLAGGED"] }, block: { courseId: block.courseId } },
        orderBy: { createdAt: "desc" },
        take: SIMILARITY_COMPARE_LIMIT,
        select: { id: true, extractedText: true },
      }),
      textHash
        ? prisma.note.findMany({
            where: { textHash, status: { in: ["LIVE", "FLAGGED"] }, block: universityScope },
            select: { id: true },
            take: 5,
          })
        : [],
    ]);

    const result = runQualityGate(
      extractedText,
      recentNotes.map((n) => n.extractedText || ""),
      parsed.info,
      exactDuplicate.length > 0,
      pageCount
    );

    // Which notes this one looks like, so the admin can open and compare
    // them: identical ones first, then the near matches from this course.
    const matches: FlagMatch[] = exactDuplicate.map((n) => ({ noteId: n.id, similarity: 1, exact: true }));
    for (const s of result.similar) {
      const noteId = recentNotes[s.index].id;
      if (!matches.some((m) => m.noteId === noteId)) {
        matches.push({ noteId, similarity: Math.round(s.similarity * 1000) / 1000, exact: false });
      }
    }

    // A scribe's very first upload is the riskiest moment — they haven't
    // proven anything yet, and the automated checks above only catch
    // specific patterns (too short, duplicate, slide-tool metadata), not
    // "genuinely unproven scribe." Force it into manual review regardless
    // of what the automated gate found, on top of whatever it already did.
    const priorUploadCount = await prisma.note.count({ where: { scribeId: user.sub } });
    const reasons = [...result.reasons];
    const reasonDetails = [...result.reasonDetails];
    if (priorUploadCount === 0) {
      reasons.push("First upload from this scribe — manual review required");
      reasonDetails.push({ code: "FIRST_UPLOAD", label: "This is the scribe's first upload — every new scribe's first note is checked by hand" });
    }
    const flagged = result.flagged || priorUploadCount === 0;
    const flagDetails: FlagDetails = { reasons: reasonDetails, matches: matches.slice(0, 8) };

    const storedFilename = await saveNoteFile(buffer, file.name);
    storedRef = storedFilename;

    const note = await prisma.note.create({
      data: {
        blockId,
        scribeId: user.sub,
        fileUrl: storedFilename,
        extractedText,
        textHash,
        pageCount,
        similarityScore: result.maxSimilarity,
        qualityScore: result.qualityScore,
        flaggedForReview: flagged,
        flagReason: reasons.length > 0 ? reasons.join("; ") : null,
        flagDetails: flagged ? (flagDetails as unknown as Prisma.InputJsonValue) : undefined,
        attestedOriginal: true,
        fulfillsRequestId: fulfilledRequest?.id,
        status: flagged ? "FLAGGED" : "RENDERING",
        scribeLevelAtUpload: scribeProfile?.level ?? null,
      },
    });

    storedRef = null; // the note now owns the file
    if (!flagged) {
      await queueNoteRender(note.id);
    }

    return NextResponse.json({
      note: { id: note.id, status: note.status },
      message: flagged
        ? "Uploaded — flagged for admin review before it goes live."
        : "Uploaded — rendering pages before it becomes live.",
    });
  } catch (err) {
    console.error("Scribe upload failed:", err);
    if (storedRef) await deleteNoteFile(storedRef);
    // Details stay in the server log; the client gets nothing it could learn from.
    return NextResponse.json({ error: "Upload failed — please try again in a moment." }, { status: 500 });
  }
});
