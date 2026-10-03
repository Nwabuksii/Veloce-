import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { isUserOnline } from "@/lib/online";

export const GET = requireRole("ADMIN", async (req: NextRequest, adminUser) => {
  const searchParams = new URL(req.url).searchParams;
  const q = searchParams.get("q")?.trim() || "";
  const rawRole = searchParams.get("role")?.trim() || "all";
  const role = ["STUDENT", "SCRIBE", "ADMIN", "DELETED"].includes(rawRole) ? rawRole : "all";
  const online = searchParams.get("online")?.trim() || "all";
  // Pagination is opt-in: callers that don't send `page` (e.g. the admin
  // messages picker) keep the old "first N matches" behaviour.
  const paged = searchParams.has("page");
  const pageSize = 20;
  const requestedPage = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);

  const onlineSince = new Date(Date.now() - 5 * 60 * 1000);
  const baseWhere: any = {
    universityId: adminUser.universityId,
    // "All roles" leaves out deleted accounts; pick "Deleted" to see them.
    ...(role !== "all" ? { role } : { role: { not: "DELETED" as const } }),
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

  const matchingCount = paged ? await prisma.user.count({ where }) : 0;
  const totalPages = Math.max(1, Math.ceil(matchingCount / pageSize));
  const page = Math.min(requestedPage, totalPages);

  const pageArgs: { skip?: number; take: number } = paged
    ? { skip: (page - 1) * pageSize, take: pageSize }
    : { take: q ? 10 : 50 };

  const [users, totalUsers, loggedInUsers, studentUsers, scribeUsers, adminUsers, deletedUsers] = await Promise.all([
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
      ...pageArgs,
      orderBy: [{ fullName: "asc" }, { id: "asc" }],
    }),
    prisma.user.count({ where: { universityId: adminUser.universityId, role: { not: "DELETED" } } }),
    prisma.user.count({ where: { universityId: adminUser.universityId, role: { not: "DELETED" }, lastLoginAt: { not: null } } }),
    prisma.user.count({ where: { universityId: adminUser.universityId, role: "STUDENT" } }),
    prisma.user.count({ where: { universityId: adminUser.universityId, role: "SCRIBE" } }),
    prisma.user.count({ where: { universityId: adminUser.universityId, role: "ADMIN" } }),
    prisma.user.count({ where: { universityId: adminUser.universityId, role: "DELETED" } }),
  ]);

  return NextResponse.json({
    ...(paged ? { pagination: { page, pageSize, totalPages, totalMatching: matchingCount } } : {}),
    stats: {
      total: totalUsers,
      loggedIn: loggedInUsers,
      students: studentUsers,
      scribes: scribeUsers,
      admins: adminUsers,
      deleted: deletedUsers,
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
