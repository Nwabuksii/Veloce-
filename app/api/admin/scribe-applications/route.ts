import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { applicantUserSelect, scoreApplicantUser } from "@/lib/applicant-score";

// Admin-only: see everyone waiting to be approved as a scribe, each with a
// 0-100 score and the breakdown behind it (a guide only — see
// lib/applicant-score.ts). Appeals from demoted scribes are a separate list —
// see /api/admin/appeals. Filtering and sorting happen in the page.
export const GET = requireRole("ADMIN", async (req: NextRequest, user) => {
  const rows = await prisma.scribeApplication.findMany({
    where: { status: "PENDING", type: "APPLICATION", user: { universityId: user.universityId } },
    include: { user: { select: applicantUserSelect } },
    orderBy: { submittedAt: "asc" },
  });

  const applications = rows
    .map((a) => {
      const { score, label, lines } = scoreApplicantUser(a.user);
      return {
        id: a.id,
        reason: a.reason,
        status: a.status,
        submittedAt: a.submittedAt,
        user: {
          id: a.user.id,
          fullName: a.user.fullName,
          email: a.user.email,
          level: a.user.level,
          department: a.user.department?.name ?? null,
        },
        score,
        scoreLabel: label,
        breakdown: lines,
      };
    })
    .sort((a, b) => b.score - a.score);

  return NextResponse.json({ applications });
});
