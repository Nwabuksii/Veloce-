import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const GET = requireRole("ADMIN", async (req: NextRequest, admin) => {
  const scribes = await prisma.user.findMany({
    where: { role: "SCRIBE", universityId: admin.universityId },
    select: {
      id: true,
      fullName: true,
      email: true,
      createdAt: true,
      _count: { select: { notes: true } },
    },
    orderBy: { fullName: "asc" },
  });

  const result = scribes.map((s) => ({
    id: s.id,
    fullName: s.fullName,
    email: s.email,
    joinedAt: s.createdAt,
    uploadCount: s._count.notes,
  }));

  return NextResponse.json({ scribes: result });
});
