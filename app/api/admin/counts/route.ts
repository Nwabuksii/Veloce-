import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// Admin-only: pending-action counts per section, scoped to the admin's
// own university — same scoping rule as every other /api/admin/* route.
//
// Two kinds of counts:
//   Type A (action sections): raw pending counts. Stay until resolved.
//     reports, applications, appeals, moderation, payouts, demotedScribes
//   Type B (view-only sections): unseen-since-last-visit counts. Clear
//     when the admin opens the page. Currently: feedback, disputes (ledger).
export const GET = requireRole("ADMIN", async (req: NextRequest, user) => {
  const universityId = user.universityId;

  // Look up the admin's last-seen timestamps for view-only sections.
  const views = await prisma.adminSectionView.findMany({
    where: { adminId: user.sub, section: { in: ["feedback", "ledger"] } },
  });
  const lastSeen: Record<string, Date | null> = {
    feedback: null,
    ledger: null,
  };
  for (const v of views) lastSeen[v.section] = v.lastSeenAt;

  const feedbackSince = lastSeen.feedback ?? new Date(0);
  const ledgerSince = lastSeen.ledger ?? new Date(0);

  const [
    applications,
    appeals,
    moderation,
    maliciousBlocks,
    reports,
    payouts,
    disputes,
    demotedScribes,
    feedback,
  ] = await Promise.all([
    // ── Type A: action sections (pending until resolved) ──
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
    prisma.block.count({
      where: {
        moderationStatus: { in: ["POTENTIAL_MALICIOUS", "ADMIN_REVIEW"] },
        course: { department: { universityId } },
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
    prisma.user.count({
      where: {
        role: "SCRIBE",
        demotedAt: { not: null },
        universityId,
      },
    }),

    // ── Type B: view-only sections (clear on visit) ──
    prisma.purchase.count({
      where: {
        refundedAt: null,
        buyer: { universityId },
        disputedAt: { not: null, gt: ledgerSince },
      },
    }),
    prisma.feedback.count({
      where: {
        user: { universityId },
        createdAt: { gt: feedbackSince },
      },
    }),
  ]);

  // Total badge shown on the ProfileMenu button = every section's count.
  const total =
    applications +
    appeals +
    moderation +
    maliciousBlocks +
    reports +
    payouts +
    demotedScribes +
    disputes +
    feedback;

  return NextResponse.json({
    applications,
    appeals,
    moderation: moderation + maliciousBlocks,
    reports,
    payouts,
    disputes,
    demotedScribes,
    feedback,
    total,
  });
});
