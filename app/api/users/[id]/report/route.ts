import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { rateLimitResponse } from "@/lib/rate-limit";

interface RouteContext {
  params: { id: string };
}

const reportSchema = z.object({
  reason: z.string().min(10, "Tell us a bit more — at least 10 characters").max(1000),
});

export const POST = requireRole<RouteContext>("STUDENT", async (req: NextRequest, user, ctx) => {
  const reportedUserId = ctx.params.id;

  // Shared by all three report routes (note / block / user): stops one
  // account from flooding the moderation queue, and — for block reports —
  // from auto-hiding a block on its own (see evaluateBlockModeration).
  const blocked = await rateLimitResponse(`report:${user.sub}`, 10, 60 * 60 * 1000, "You're sending reports too quickly. Please try again later.");
  if (blocked) return blocked;

  if (reportedUserId === user.sub) {
    return NextResponse.json({ error: "You can't report yourself" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: reportedUserId } });

  // No same-university check anymore — see app/api/notes/[id]/report for
  // the same reasoning. Routes to the reported person's own university's
  // admins via app/api/admin/reports/route.ts, not the reporter's.
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const parsed = reportSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // One open report per reporter per target — a second one only adds noise
  // (and, for blocks, must not count twice toward auto-moderation).
  const alreadyReported = await prisma.report.findFirst({
    where: { reporterId: user.sub, status: "PENDING", type: "USER", reportedUserId },
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
        type: "USER",
        reporterId: user.sub,
        reportedUserId,
        reason: parsed.data.reason,
      },
    });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "You've already reported this — our team will review it." }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json({ report });
});
