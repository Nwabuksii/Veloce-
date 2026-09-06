import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// Admin-only: see everyone waiting to be approved as a scribe. Appeals from
// demoted scribes are a separate list — see /api/admin/appeals.
export const GET = requireRole("ADMIN", async (req: NextRequest, user) => {
  const applications = await prisma.scribeApplication.findMany({
    where: { status: "PENDING", type: "APPLICATION", user: { universityId: user.universityId } },
    include: { user: { select: { id: true, fullName: true, email: true, departmentId: true, level: true } } },
    orderBy: { submittedAt: "asc" },
  });

  return NextResponse.json({ applications });
});
