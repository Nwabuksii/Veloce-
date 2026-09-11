import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const GET = requireRole("ADMIN", async (req: NextRequest, user) => {
  const notes = await prisma.note.findMany({
    where: {
      status: { in: ["FLAGGED", "PENDING_REVIEW"] },
      block: { course: { department: { universityId: user.universityId } } },
    },
    include: {
      block: { include: { course: true } },
      scribe: { select: { fullName: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ notes });
});
