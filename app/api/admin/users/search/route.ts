import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { isUserOnline } from "@/lib/online";

export const GET = requireRole("ADMIN", async (req: NextRequest, adminUser) => {
  const q = new URL(req.url).searchParams.get("q")?.trim() || "";

  const where = q
    ? {
        universityId: adminUser.universityId,
        OR: [
          { fullName: { contains: q, mode: "insensitive" as const } },
          { email: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : { universityId: adminUser.universityId };

  const [users, totalUsers, loggedInUsers, studentUsers, scribeUsers, adminUsers] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        bannedAt: true,
        banReason: true,
        banExpiresAt: true,
        avatarUrl: true,
        avatarDisplay: true,
        departmentId: true,
        department: { select: { name: true } },
        level: true,
        lastLoginAt: true,
        lastSeenAt: true,
        createdAt: true,
        notes: { select: { id: true } },
        purchases: { select: { id: true } },
        requestVotes: { select: { id: true } },
        following: { select: { id: true } },
        reportsFiled: { select: { id: true } },
      },
      take: q ? 10 : 50,
      orderBy: { fullName: "asc" },
    }),
    prisma.user.count({ where: { universityId: adminUser.universityId } }),
    prisma.user.count({ where: { universityId: adminUser.universityId, lastLoginAt: { not: null } } }),
    prisma.user.count({ where: { universityId: adminUser.universityId, role: "STUDENT" } }),
    prisma.user.count({ where: { universityId: adminUser.universityId, role: "SCRIBE" } }),
    prisma.user.count({ where: { universityId: adminUser.universityId, role: "ADMIN" } }),
  ]);

  return NextResponse.json({
    stats: {
      total: totalUsers,
      loggedIn: loggedInUsers,
      students: studentUsers,
      scribes: scribeUsers,
      admins: adminUsers,
    },
    users: users.map((u) => ({
      ...u,
      isOnline: isUserOnline(u.lastSeenAt),
      departmentName: u.department?.name ?? null,
      noteCount: u.notes.length,
      purchaseCount: u.purchases.length,
      requestCount: u.requestVotes.length,
      followingCount: u.following.length,
      reportCount: u.reportsFiled.length,
      avatarUrl: u.avatarDisplay === "custom" ? u.avatarUrl : null,
    })),
  });
});
