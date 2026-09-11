import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const GET = requireRole("ADMIN", async (req: NextRequest, adminUser) => {
  const q = new URL(req.url).searchParams.get("q")?.trim() || "";

  if (q.length < 2) {
    return NextResponse.json({ users: [] });
  }

  const users = await prisma.user.findMany({
    where: {
      universityId: adminUser.universityId,
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, fullName: true, email: true, role: true, bannedAt: true, banReason: true, banExpiresAt: true },
    take: 10,
    orderBy: { fullName: "asc" },
  });

  return NextResponse.json({ users });
});
