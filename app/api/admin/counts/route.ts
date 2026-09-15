import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// Admin-only: pending-action counts per section, scoped to the admin's
// own university — same scoping rule as every other /api/admin/* route.
export const GET = requireRole("ADMIN", async (req: NextRequest, user) => {
  const universityId = user.universityId;

  const [
    applications,
    appeals,
    moderation,
    reports,
    payouts,
    disputes,
    demotedScribes,
    feedback,
  ] = await Promise.all([
    prisma.scribeApplication.count({
      where: {
        type: "APPLICATION",
        status: "PENDING",
        user: { universityId },
      },
    }),
    prisma.scribeApplication.count({
      where: {
        type: "APPEAL",
        status: "PENDING",
        user: { universityId },
      },
    }),
    prisma.note.count({
      where: {
        status: { in: ["PENDING_REVIEW", "FLAGGED"] },
        scribe: { universityId },
      },
    }),
    prisma.report.count({
      where: {
        status: "PENDING",
        reporter: { universityId },
      },
    }),
    prisma.payout.count({
      where: {
        status: "PENDING",
        scribe: { universityId },
      },
    }),
    prisma.purchase.count({
      where: {
        disputedAt: { not: null },
        refundedAt: null,
        buyer: { universityId },
      },
    }),
    prisma.user.count({
      where: {
        role: "SCRIBE",
        demotedAt: { not: null },
        universityId,
      },
    }),
    prisma.feedback.count({
      where: { user: { universityId } },
    }),
  ]);

  const total =
    applications +
    appeals +
    moderation +
    reports +
    payouts +
    disputes +
    demotedScribes +
    feedback;

  return NextResponse.json({
    applications,
    appeals,
    moderation,
    reports,
    payouts,
    disputes,
    demotedScribes,
    feedback,
    total,
  });
});
