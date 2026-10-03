import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { rateLimitResponse } from "@/lib/rate-limit";
import { evaluateBlockModeration } from "@/lib/block-moderation";

interface RouteContext {
  params: { id: string };
}

const reportSchema = z.object({
  reason: z.string().min(10, "Tell us a bit more — at least 10 characters").max(1000),
});

// Reports one specific scribe's version of a block, not the block
// generically — an admin reviewing this can jump straight to the exact
// upload in question, even when several scribes wrote competing versions.
export const POST = requireRole<RouteContext>("STUDENT", async (req: NextRequest, user, ctx) => {
  const noteId = ctx.params.id;

  // Shared by all three report routes (note / block / user): stops one
  // account from flooding the moderation queue, and — for block reports —
  // from auto-hiding a block on its own (see evaluateBlockModeration).
  const blocked = await rateLimitResponse(`report:${user.sub}`, 10, 60 * 60 * 1000, "You're sending reports too quickly. Please try again later.");
  if (blocked) return blocked;

  const note = await prisma.note.findUnique({ where: { id: noteId } });

  // Deliberately no same-university check here anymore — once cross-
  // university browsing/buying is on, a student can legitimately encounter
  // and need to report a note from another school. The report still ends
  // up in the right place: app/api/admin/reports/route.ts routes it to
  // the NOTE'S OWN university's admins (the ones with authority over that
  // scribe), not the reporter's.
  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const parsed = reportSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // One open report per reporter per target — a second one only adds noise
  // (and, for blocks, must not count twice toward auto-moderation).
  const alreadyReported = await prisma.report.findFirst({
    where: { reporterId: user.sub, status: "PENDING", type: "BLOCK", noteId: note.id },
    select: { id: true },
  });
  if (alreadyReported) {
    return NextResponse.json({ error: "You've already reported this — our team will review it." }, { status: 409 });
  }

  // The check above is only a fast, friendly answer. The database's one-open-
  // report-per-target index is what stops two simultaneous requests both
  // getting through, so its rejection is the same 409.
  let report;
  try {
    report = await prisma.report.create({
      data: {
        type: "BLOCK",
        reporterId: user.sub,
        blockId: note.blockId,
        noteId: note.id,
        reason: parsed.data.reason,
      },
    });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "You've already reported this — our team will review it." }, { status: 409 });
    }
    throw err;
  }

  // Reports on a single version count toward the block's moderation status
  // too, the same as reports on the block itself.
  await evaluateBlockModeration(note.blockId);

  return NextResponse.json({ report });
});
