import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

interface RouteContext {
  params: { id: string };
}

const resolveSchema = z.object({
  action: z.enum(["dismiss", "action"]),
});

// Deliberately doesn't automatically remove the block or demote the user —
// an admin decides that separately (via the existing moderation/demote
// tools) and just marks the report itself as handled here, so one report
// can't accidentally trigger an irreversible action on its own.
export const POST = requireRole<RouteContext>("ADMIN", async (req: NextRequest, adminUser, ctx) => {
  const report = await prisma.report.findUnique({
    where: { id: ctx.params.id },
    include: { reporter: true },
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

  const parsed = resolveSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await prisma.report.update({
    where: { id: report.id },
    data: {
      status: parsed.data.action === "dismiss" ? "DISMISSED" : "ACTIONED",
      reviewedAt: new Date(),
      reviewedById: adminUser.sub,
    },
  });

  return NextResponse.json({ report: updated });
});
