import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// Admin-only: everything pending review, both block reports and user
// reports together (sorted oldest first, same as the other review queues).
export const GET = requireRole("ADMIN", async (req: NextRequest, user) => {
  const reports = await prisma.report.findMany({
    where: { status: "PENDING", reporter: { universityId: user.universityId } },
    include: {
      reporter: { select: { id: true, fullName: true, email: true } },
      block: { select: { id: true, title: true, course: { select: { code: true, name: true } } } },
      reportedUser: { select: { id: true, fullName: true, email: true, role: true } },
      note: { select: { id: true, scribe: { select: { id: true, fullName: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ reports });
});
