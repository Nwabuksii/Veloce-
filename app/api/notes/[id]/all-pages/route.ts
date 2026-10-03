import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { checkNoteAccess, markNoteOpened } from "@/lib/note-access";
import { readNoteFile } from "@/lib/storage";
import { getPdfPageCount, renderPdfPagesToImages, stampWatermark, PdfLimitError } from "@/lib/pdf-render";
import { rateLimitResponse } from "@/lib/rate-limit";
import { mapLimit } from "@/lib/async-limits";

// Rendering and watermarking every page of a note is the single most
// expensive request in the app, so it gets a much tighter limit than the
// one-page route (300 per 5 minutes). A real reader needs this once per note.
const ALL_PAGES_LIMIT = 20;
const ALL_PAGES_WINDOW_MS = 5 * 60 * 1000;
const STAMP_CONCURRENCY = 3; // watermarks stamped at the same time

// Personalised (each image carries the viewer's name + email) — never cache.
const NO_STORE = { "Cache-Control": "private, no-store, no-cache, must-revalidate" };

interface RouteContext {
  params: { id: string };
}

// requireRole (not the bare getSessionUser) so a banned, deleted or
// signed-out-everywhere account is cut off here exactly as it is on every
// other route — previously these three routes only checked the token
// signature, so a banned user could keep reading everything they'd bought.
export const GET = requireRole<RouteContext>("STUDENT", async (req: NextRequest, user, ctx) => {
  const blocked = await rateLimitResponse(
    `note-all-pages:${user.sub}`,
    ALL_PAGES_LIMIT,
    ALL_PAGES_WINDOW_MS,
    "You're loading full notes too quickly — please try again in a few minutes."
  );
  if (blocked) return blocked;

  const { note, allowed } = await checkNoteAccess(user, ctx.params.id);
  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }
  if (!allowed) {
    return NextResponse.json({ error: "You don't have access to this note" }, { status: 403 });
  }

  // A buyer can only pull the full note while it is LIVE — a note that was
  // removed, rejected or flagged shouldn't stay downloadable just because
  // their purchase row still exists. The scribe who owns it and an admin at
  // the same university (who reviews FLAGGED/PENDING notes from the
  // moderation page) are exempt, since checkNoteAccess already vetted them.
  const isOwner = note.scribeId === user.sub;
  const isModerator = user.role === "ADMIN" && note.scribe.universityId === user.universityId;
  if (note.status !== "LIVE" && !isOwner && !isModerator) {
    return NextResponse.json({ error: "This note isn't available right now" }, { status: 409 });
  }

  await markNoteOpened(user.sub, note.id);

  const viewer = await prisma.user.findUnique({
    where: { id: user.sub },
    select: { fullName: true, email: true },
  });

  if (!viewer) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Read the file once and reuse it for the page count and the render.
  const pdfBuffer = await readNoteFile(note.fileUrl);

  let pageCount = note.pageCount ?? 0;
  if (!pageCount) {
    pageCount = await getPdfPageCount(pdfBuffer);
    await prisma.note.update({ where: { id: note.id }, data: { pageCount } });
  }

  let renderedPages: Map<number, Buffer>;
  try {
    renderedPages = await renderPdfPagesToImages(pdfBuffer, pageCount);
  } catch (err) {
    if (err instanceof PdfLimitError) {
      return NextResponse.json({ error: "This note is too large to load all at once." }, { status: 422, headers: NO_STORE });
    }
    throw err;
  }

  const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1);
  const images = await mapLimit(pageNumbers, STAMP_CONCURRENCY, async (pageNum) => {
    const baseBuffer = renderedPages.get(pageNum) ?? pdfBuffer;
    const watermarked = await stampWatermark(baseBuffer, [`${viewer.fullName} . ${viewer.email}`]);
    return `data:image/jpeg;base64,${watermarked.toString("base64")}`;
  });

  return NextResponse.json({ images, pageCount }, { headers: NO_STORE });
});
