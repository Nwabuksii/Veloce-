import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { checkNoteAccess } from "@/lib/note-access";
import { readNoteFile, saveNotePageImage } from "@/lib/storage";
import { getPdfPageCount, renderPdfPageToImage, stampWatermark } from "@/lib/pdf-render";
import { checkRateLimit } from "@/lib/rate-limit";

// Generous enough for genuine reading (flipping through a 300-page note
// fast, or several notes back to back) while still capping how fast any
// one account can pull pages — this is by far the most CPU-expensive
// route in the app (canvas rendering + watermark stamping on a cache
// miss) and, unlike login/signup/refund-request, had no limit at all.
const PAGE_VIEW_LIMIT = 300;
const PAGE_VIEW_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

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

  // Keyed per-user, not per-IP like the auth routes — this is already
  // behind a session, so the account itself is the meaningful identity to
  // limit, and a per-IP key would also wrongly lump together everyone on
  // a shared campus network.
  const withinLimit = await checkRateLimit(`note-page:${user.sub}`, PAGE_VIEW_LIMIT, PAGE_VIEW_WINDOW_MS);
  if (!withinLimit) {
    return NextResponse.json(
      { error: "You're loading pages too quickly — please slow down and try again shortly." },
      { status: 429 }
    );
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

  // Marks "the buyer actually started reading this" the first time only —
  // updateMany's WHERE (buyerId + firstOpenedAt: null) makes this a no-op
  // on every later page view, and it only ever matches a real purchase
  // row, so an admin or the scribe just previewing their own note (who
  // reach this point via checkNoteAccess's other two access paths, with
  // no Purchase row at all) never sets it. Powers the "you haven't opened
  // this yet" nudge on the purchases page.
  await prisma.purchase.updateMany({
    where: { buyerId: user.sub, noteId: note.id, refundedAt: null, firstOpenedAt: null },
    data: { firstOpenedAt: new Date() },
  });

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

  try {
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
  } catch (err) {
    // Upload now validates the PDF opens before it can ever go LIVE, but
    // this still guards any note saved before that check existed —
    // surface a clear, expected error instead of an unhandled crash.
    console.error(`Failed to read/render page ${pageNum} for note ${note.id}:`, err);
    return NextResponse.json(
      { error: "This file couldn't be opened — it may not have uploaded correctly. Please contact the scribe or support." },
      { status: 422 }
    );
  }

  // "Name . email" of whoever is actually logged in and reading — pulled from
  // the database above, never hardcoded.
  const watermarked = await stampWatermark(baseImageBuffer, [`${viewer.fullName} . ${viewer.email}`]);

  return new NextResponse(new Uint8Array(watermarked), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, no-store, no-cache, must-revalidate",
    },
  });
}
