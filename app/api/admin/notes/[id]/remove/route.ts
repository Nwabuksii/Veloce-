import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

interface RouteContext {
  params: { id: string };
}

const removeSchema = z.object({
  reason: z.string().min(10, "Give the scribe at least a short reason.").max(1000),
});

// Takes a live, reported note off sale. This deliberately reuses the same
// REJECTED status the automated quality gate uses for brand-new uploads —
// every place trust level is computed (lib/trust-level.ts) already treats
// any REJECTED note as a strike against the scribe, and every purchase/
// listing query already excludes anything not LIVE. So flipping this one
// field gets us "off the shelf" + "counts against their trust score" for
// free, with no separate scoring system to maintain.
//
// Also resolves every still-PENDING report filed against this exact note
// (not just the one the admin clicked from) as ACTIONED, and notifies the
// scribe and every one of those reporters — so nobody has to separately
// dismiss/action five duplicate reports about the same bad file by hand.
export const POST = requireRole<RouteContext>("ADMIN", async (req: NextRequest, adminUser, ctx) => {
  const noteId = ctx.params.id;

  const note = await prisma.note.findUnique({
    where: { id: noteId },
    include: {
      scribe: true,
      block: { select: { id: true, title: true, course: { select: { code: true, name: true } } } },
    },
  });

  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  if (note.scribe.universityId !== adminUser.universityId) {
    return NextResponse.json({ error: "Cannot manage notes outside your university" }, { status: 403 });
  }

  if (note.status === "REJECTED") {
    return NextResponse.json({ error: "This version has already been removed" }, { status: 409 });
  }

  const parsed = removeSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { reason } = parsed.data;

  const pendingReports = await prisma.report.findMany({
    where: { noteId: note.id, status: "PENDING" },
    include: { reporter: true },
  });

  const blockLabel = `${note.block.course.code} — ${note.block.title}`;
  const now = new Date();

  await prisma.$transaction([
    prisma.note.update({
      where: { id: note.id },
      data: { status: "REJECTED" },
    }),

    ...(pendingReports.length > 0
      ? [
          prisma.report.updateMany({
            where: { id: { in: pendingReports.map((r) => r.id) } },
            data: { status: "ACTIONED", reviewedAt: now, reviewedById: adminUser.sub },
          }),
        ]
      : []),

    prisma.adminMessage.create({
      data: {
        recipientId: note.scribeId,
        senderId: adminUser.sub,
        subject: `Your version of "${blockLabel}" was removed`,
        body: `An admin removed your uploaded version of "${blockLabel}" after it was reported. Reason given: "${reason}". This counts against your trust level. If you think this was a mistake, you can reach out via Settings.`,
      },
    }),
  ]);

  // Notify each reporter separately (one message per unique person, even
  // if the same person somehow filed more than one report on this note).
  const uniqueReporters = new Map(pendingReports.map((r) => [r.reporterId, r.reporter]));
  if (uniqueReporters.size > 0) {
    await prisma.adminMessage.createMany({
      data: Array.from(uniqueReporters.keys()).map((reporterId) => ({
        recipientId: reporterId,
        senderId: adminUser.sub,
        subject: `Update on your report — "${blockLabel}"`,
        body: `Thanks for the report. We reviewed the version of "${blockLabel}" you flagged and removed it from sale.`,
      })),
    });
  }

  return NextResponse.json({
    note: { id: note.id, status: "REJECTED" },
    reportsResolved: pendingReports.length,
    reportersNotified: uniqueReporters.size,
  });
});
