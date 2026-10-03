import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { isUserOnline } from "@/lib/online";

const PAGE_SIZE = 20;

const SORTS: Record<string, Prisma.UserOrderByWithRelationInput[]> = {
  "name-asc": [{ fullName: "asc" }, { id: "asc" }],
  "name-desc": [{ fullName: "desc" }, { id: "asc" }],
  "uploads-desc": [{ notes: { _count: "desc" } }, { fullName: "asc" }, { id: "asc" }],
  "uploads-asc": [{ notes: { _count: "asc" } }, { fullName: "asc" }, { id: "asc" }],
  "joined-desc": [{ createdAt: "desc" }, { id: "asc" }],
  "joined-asc": [{ createdAt: "asc" }, { id: "asc" }],
};

// Active scribes only (deleted accounts have their own role, so they never
// show up here). Search, filters, sort and pages all run in the database.
export const GET = requireRole("ADMIN", async (req: NextRequest, admin) => {
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q")?.trim() || "";
  const department = sp.get("department")?.trim() || "all";
  const level = sp.get("level")?.trim() || "all";
  const online = sp.get("online")?.trim() || "all";
  const sort = sp.get("sort") && SORTS[sp.get("sort")!] ? sp.get("sort")! : "name-asc";
  const requestedPage = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);

  const onlineSince = new Date(Date.now() - 5 * 60 * 1000);
  const and: Prisma.UserWhereInput[] = [];
  if (q) {
    and.push({
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (online === "online") and.push({ lastSeenAt: { gte: onlineSince } });
  if (online === "offline") and.push({ OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: onlineSince } }] });

  const base: Prisma.UserWhereInput = { role: "SCRIBE", universityId: admin.universityId };
  const where: Prisma.UserWhereInput = {
    ...base,
    ...(department !== "all" ? { departmentId: department } : {}),
    ...(level !== "all" ? { level } : {}),
    ...(and.length ? { AND: and } : {}),
  };

  const matching = await prisma.user.count({ where });
  const totalPages = Math.max(1, Math.ceil(matching / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const [scribes, total, onlineCount, deptGroups, levelGroups] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        email: true,
        createdAt: true,
        level: true,
        lastSeenAt: true,
        avatarUrl: true,
        avatarDisplay: true,
        department: { select: { name: true } },
        _count: { select: { notes: true } },
      },
      orderBy: SORTS[sort],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.user.count({ where: base }),
    prisma.user.count({ where: { ...base, lastSeenAt: { gte: onlineSince } } }),
    prisma.user.groupBy({ by: ["departmentId"], where: { ...base, departmentId: { not: null } } }),
    prisma.user.groupBy({ by: ["level"], where: { ...base, level: { not: null } } }),
  ]);

  const deptIds = deptGroups.map((g) => g.departmentId!).filter(Boolean);
  const departments = deptIds.length
    ? await prisma.department.findMany({ where: { id: { in: deptIds } }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    : [];
  const levels = levelGroups.map((g) => g.level!).filter(Boolean).sort((a, b) => parseInt(a) - parseInt(b));

  return NextResponse.json({
    pagination: { page, pageSize: PAGE_SIZE, totalPages, totalMatching: matching },
    stats: { total, online: onlineCount },
    filters: { departments, levels },
    scribes: scribes.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      email: s.email,
      joinedAt: s.createdAt,
      level: s.level,
      departmentName: s.department?.name ?? null,
      isOnline: isUserOnline(s.lastSeenAt),
      uploadCount: s._count.notes,
      avatarUrl: s.avatarDisplay === "custom" ? s.avatarUrl : null,
    })),
  });
});
