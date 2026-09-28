import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { isUserOnline } from "@/lib/online";

export const GET = requireRole("ADMIN", async (req: NextRequest, adminUser) => {
  const searchParams = new URL(req.url).searchParams;
  const q = searchParams.get("q")?.trim() || "";
  const role = searchParams.get("role")?.trim() || "all";
  const online = searchParams.get("online")?.trim() || "all";

  const onlineSince = new Date(Date.now() - 5 * 60 * 1000);
  const baseWhere: any = {
    universityId: adminUser.universityId,
    ...(role !== "all" ? { role } : {}),
  };

  if (q) {
    baseWhere.OR = [
      { fullName: { contains: q, mode: "insensitive" as const } },
      { email: { contains: q, mode: "insensitive" as const } },
    ];
  }

  if (online === "online") {
    baseWhere.lastSeenAt = { gte: onlineSince };
  } else if (online === "offline") {
    baseWhere.OR = [
      ...(baseWhere.OR ?? []),
    ];
    baseWhere.AND = [
      ...(baseWhere.AND ?? []),
      { OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: onlineSince } }] },
    ];
    delete baseWhere.OR;
    if (q) {
      baseWhere.AND.push({
        OR: [
          { fullName: { contains: q, mode: "insensitive" as const } },
          { email: { contains: q, mode: "insensitive" as const } },
        ],
      });
    }
  }

  const where = baseWhere;

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
