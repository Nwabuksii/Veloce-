import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

interface RouteContext {
  params: { id: string };
}

// Dismissing a report just means "reviewed, nothing to do here" — the
// reporter is told so directly instead of being left wondering whether
// anyone looked at it. Real corrective actions (refund a purchase, remove
// a note version, ban a user) live in their own endpoints and resolve the
// relevant report(s) themselves; this route is only ever the "no action
// needed" outcome, so unlike those it doesn't take a reason from the body.
function dismissMessage(report: {
  type: string;
  block: { title: string } | null;
  note: { scribe: { fullName: string } } | null;
  reportedUser: { fullName: string } | null;
  purchase: { block: { title: string } } | null;
}) {
  if (report.type === "REFUND" && report.purchase) {
    return {
      subject: `Update on your refund request — "${report.purchase.block.title}"`,
      body: `We looked into your refund request for "${report.purchase.block.title}" and won't be issuing a refund. If there's more you think we should know, reach out via Settings.`,
    };
  }
  if (report.type === "USER" && report.reportedUser) {
    return {
      subject: `Update on your report about ${report.reportedUser.fullName}`,
      body: `We looked into your report about ${report.reportedUser.fullName} and didn't find grounds to take action.`,
    };
  }
  if (report.block) {
    const who = report.note ? ` by ${report.note.scribe.fullName}` : "";
    return {
      subject: `Update on your report — "${report.block.title}"`,
      body: `We reviewed the version of "${report.block.title}"${who} you flagged and didn't find a problem with it — it's staying up.`,
    };
  }
  return {
    subject: "Update on your report",
    body: "We reviewed your report and didn't find anything requiring action.",
  };
}

export const POST = requireRole<RouteContext>("ADMIN", async (req: NextRequest, adminUser, ctx) => {
  const report = await prisma.report.findUnique({
    where: { id: ctx.params.id },
    include: {
      reporter: true,
      block: { select: { title: true } },
      reportedUser: { select: { fullName: true } },
      note: { select: { scribe: { select: { fullName: true } } } },
      purchase: { select: { block: { select: { title: true } } } },
    },
  });

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  if (report.reporter.universityId !== adminUser.universityId) {
    return NextResponse.json({ error: "Cannot manage reports outside your university" }, { status: 403 });
  }

  if (report.status !== "PENDING") {
    return NextResponse.json({ error: `Report already ${report.status.toLowerCase()}` }, { status: 409 });
  }

  const { subject, body } = dismissMessage(report);
  const now = new Date();

  const [updated] = await prisma.$transaction([
    prisma.report.update({
      where: { id: report.id },
      data: { status: "DISMISSED", reviewedAt: now, reviewedById: adminUser.sub },
    }),
    prisma.adminMessage.create({
      data: { recipientId: report.reporterId, senderId: adminUser.sub, subject, body },
    }),
  ]);

  return NextResponse.json({ report: updated });
});
