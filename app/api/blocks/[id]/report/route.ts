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

export const POST = requireRole<RouteContext>("STUDENT", async (req: NextRequest, user, ctx) => {
  const blockId = ctx.params.id;

  // Shared by all three report routes (note / block / user): stops one
  // account from flooding the moderation queue, and — for block reports —
  // from auto-hiding a block on its own (see evaluateBlockModeration).
  const blocked = await rateLimitResponse(`report:${user.sub}`, 10, 60 * 60 * 1000, "You're sending reports too quickly. Please try again later.");
  if (blocked) return blocked;

  const block = await prisma.block.findUnique({ where: { id: blockId } });

  // Same reasoning as app/api/notes/[id]/report/route.ts — no university
  // check on filing; app/api/admin/reports/route.ts routes this to the
  // block's own university's admins regardless of the reporter's.
  if (!block) {
    return NextResponse.json({ error: "Block not found" }, { status: 404 });
  }

  const parsed = reportSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // One open report per reporter per target — a second one only adds noise
  // (and, for blocks, must not count twice toward auto-moderation).
  const alreadyReported = await prisma.report.findFirst({
    where: { reporterId: user.sub, status: "PENDING", type: "BLOCK", blockId, noteId: null },
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
        blockId,
        reason: parsed.data.reason,
      },
    });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "You've already reported this — our team will review it." }, { status: 409 });
    }
    throw err;
  }

  await evaluateBlockModeration(blockId);

  return NextResponse.json({ report });
});
