import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdmin } from "@/lib/auth"; // adjust to match your existing helper

export async function GET(req: NextRequest) {
  const admin = await verifyAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
      where: { type: "APPLICATION", status: "PENDING" },
    }),
    prisma.scribeApplication.count({
      where: { type: "APPEAL", status: "PENDING" },
    }),
    prisma.note.count({
      where: { status: { in: ["PENDING_REVIEW", "FLAGGED"] } },
    }),
    prisma.report.count({
      where: { status: "PENDING" },
    }),
    prisma.payout.count({
      where: { status: "PENDING" },
    }),
    prisma.purchase.count({
      where: { disputedAt: { not: null }, refundedAt: null },
    }),
    prisma.user.count({
      where: { role: "SCRIBE", demotedAt: { not: null } },
    }),
    prisma.feedback.count(),
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
}
