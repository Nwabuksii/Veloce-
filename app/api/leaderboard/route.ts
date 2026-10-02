import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { NO_STORE } from "@/lib/cache-policy";
import { ensureFreshLeaderboard } from "@/lib/leaderboard-snapshot";
import { ALL_TIME_KEY, semesterKey, type PreviousSnapshot } from "@/lib/leaderboard-rank";

const PAGE_SIZE = 20;
const POINT_LABELS = {
  ratingPoints: "rating",
  purchasePoints: "purchases",
  readPoints: "reads",
  followerPoints: "followers",
  growthPoints: "growth",
} as const;

// Everyone signed in can view the leaderboard (student, scribe or admin).
// Reads snapshots only — the scores are recomputed by the nightly job, which
// ensureFreshLeaderboard() kicks off (at most once a day) if it is overdue.
//
// GET /api/leaderboard?scope=global|school|department&period=all|semester&page=N
// A scope the viewer can't use (global with one school, department without
// one) falls back to "school"; the response says which scope it really used.
export const GET = requireRole("STUDENT", async (req: NextRequest, user) => {
  const params = new URL(req.url).searchParams;
  const period = params.get("period") === "semester" ? "semester" : "all";
  const requestedScope = params.get("scope");
  const requestedPage = Math.max(1, parseInt(params.get("page") || "1", 10) || 1);

  await ensureFreshLeaderboard();

  const [viewer, universityCount, lock] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.sub }, select: { role: true, universityId: true, departmentId: true } }),
    prisma.university.count(),
    prisma.leaderboardLock.findUnique({ where: { id: "snapshot" }, select: { lastRunAt: true } }),
  ]);
  if (!viewer) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const showGlobal = universityCount > 1;
  const hasDepartment = !!viewer.departmentId;
  const scope: "global" | "school" | "department" =
    requestedScope === "global" && showGlobal
      ? "global"
      : requestedScope === "department" && hasDepartment
        ? "department"
        : "school";

  // "This semester" = the viewer's own university's active semester.
  let periodKey = ALL_TIME_KEY;
  let semester: { label: string } | null = null;
  if (period === "semester") {
    const active = await prisma.semester.findFirst({ where: { universityId: viewer.universityId, endsAt: null } });
    if (active) {
      periodKey = semesterKey(active.academicYear, active.number);
      semester = { label: `${active.academicYear} · S${active.number}` };
    }
  }

  const base = {
    scope,
    period,
    showGlobal,
    hasDepartment,
    semester,
    viewerIsScribe: viewer.role === "SCRIBE",
    updatedAt: lock?.lastRunAt ?? null,
  };
  const respond = (body: object) => {
    const res = NextResponse.json({ ...base, ...body });
    res.headers.set("Cache-Control", NO_STORE);
    return res;
  };

  // Asked for the semester tab but no semester has been started yet.
  if (period === "semester" && !semester) {
    return respond({ entries: [], me: null, pagination: { page: 1, pageSize: PAGE_SIZE, totalPages: 1, totalMatching: 0 } });
  }

  const rankField = scope === "global" ? "rankGlobal" : scope === "department" ? "rankDepartment" : "rankSchool";
  const where: Prisma.LeaderboardSnapshotWhereInput & { periodType: "ALL_TIME" | "SEMESTER" } = {
    periodType: period === "semester" ? ("SEMESTER" as const) : ("ALL_TIME" as const),
    periodKey,
    ...(scope === "school" ? { universityId: viewer.universityId } : {}),
    ...(scope === "department" ? { universityId: viewer.universityId, departmentId: viewer.departmentId } : {}),
    [rankField]: { not: null },
  };

  const totalMatching = await prisma.leaderboardSnapshot.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalMatching / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const [rows, mine] = await Promise.all([
    prisma.leaderboardSnapshot.findMany({
      where,
      orderBy: { [rankField]: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        scribeId: true,
        finalScore: true,
        rankDepartment: true,
        rankSchool: true,
        rankGlobal: true,
        scribe: {
          select: {
            fullName: true,
            avatarUrl: true,
            avatarDisplay: true,
            universityId: true,
            university: { select: { name: true } },
            department: { select: { name: true } },
          },
        },
      },
    }),
    prisma.leaderboardSnapshot.findUnique({
      where: { scribeId_periodType_periodKey: { scribeId: user.sub, periodType: where.periodType, periodKey } },
    }),
  ]);

  const entries = rows.map((r) => ({
    rank: r[rankField] as number,
    scribeId: r.scribeId,
    name: r.scribe.fullName,
    avatarUrl: r.scribe.avatarDisplay === "custom" ? r.scribe.avatarUrl : null,
    university: r.scribe.university.name,
    department: r.scribe.department?.name ?? null,
    score: r.finalScore,
    isMe: r.scribeId === user.sub,
    // Profiles are university-scoped, so only same-school scribes are openable.
    canOpenProfile: r.scribe.universityId === viewer.universityId,
  }));

  // "My rank" card: the viewer's own numbers and what moved since the last run.
  let me = null;
  if (mine) {
    const prev = (mine.previous ?? null) as PreviousSnapshot | null;
    const ranks = { department: mine.rankDepartment, school: mine.rankSchool, global: mine.rankGlobal };
    const prevRank = prev ? prev[rankField] : null;
    const currentRank = mine[rankField];
    const points = {
      rating: mine.ratingPoints,
      purchases: mine.purchasePoints,
      reads: mine.readPoints,
      followers: mine.followerPoints,
      growth: mine.growthPoints,
    };
    // Per-metric point changes since the previous run (only the ones that moved).
    const moved = prev
      ? (Object.keys(POINT_LABELS) as (keyof typeof POINT_LABELS)[])
          .map((k) => ({ metric: POINT_LABELS[k], delta: Math.round((mine[k] - prev[k]) * 100) / 100 }))
          .filter((m) => m.delta !== 0)
      : [];
    me = {
      finalScore: mine.finalScore,
      ranks,
      points,
      // positive = moved up that many places
      rankChange: prev && prevRank != null && currentRank != null ? prevRank - currentRank : null,
      scoreChange: prev ? Math.round((mine.finalScore - prev.finalScore) * 100) / 100 : null,
      moved,
    };
  }

  return respond({ entries, me, pagination: { page, pageSize: PAGE_SIZE, totalPages, totalMatching } });
});
