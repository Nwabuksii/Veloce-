import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// Admin-only: demoted scribes asking to be reinstated. Separate list from
// first-time applications (see /api/admin/scribe-applications) even though
// both live in the ScribeApplication table.
export const GET = requireRole("ADMIN", async (req: NextRequest, user) => {
  const appeals = await prisma.scribeApplication.findMany({
    where: { status: "PENDING", type: "APPEAL", user: { universityId: user.universityId } },
    include: {
      user: { select: { id: true, fullName: true, email: true, departmentId: true, level: true, demotedAt: true } },
    },
    orderBy: { submittedAt: "asc" },
  });

  return NextResponse.json({ appeals });
});
