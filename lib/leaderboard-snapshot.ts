import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncAllTimeBadges } from "./badge-awards";
import { scoreScribe } from "./leaderboard-score";
import {
  ALL_TIME_KEY,
  aggregateScribeStats,
  assignRanks,
  carryOver,
  semesterKey,
  type ExistingSnapshot,
  type PreviousSnapshot,
  type RankEntry,
} from "./leaderboard-rank";

// The leaderboard job. Scores every eligible scribe for each period and saves
// one LeaderboardSnapshot row per scribe per period; the leaderboard pages only
// ever read those rows. Periods: all-time, each university's active semester,
// and each university's current academic year.
//
// There is no scheduler (same approach as lib/security-archive.ts): call
// ensureFreshLeaderboard() when the leaderboard is requested and it re-runs at
// most once a day, guarded by a database lock so two servers never run it at
// once. Closed semesters are never recomputed — their snapshot stays frozen.

const LOCK_ID = "snapshot";
const LOCK_MS = 15 * 60 * 1000; // also the cool-off after a failed run
const FRESH_MS = 24 * 60 * 60 * 1000;
// Scribes are loaded in batches so the "IN (…)" lists stay well under
// Postgres' bind-parameter limit.
const BATCH = 100;

type PeriodType = "ALL_TIME" | "SEMESTER" | "YEAR";

interface Period {
  type: PeriodType;
  key: string;
  universityId: string | null; // null = every university
  from: Date | null; // null = since the beginning
  to: Date;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function buildPeriods(now: Date): Promise<Period[]> {
  const periods: Period[] = [{ type: "ALL_TIME", key: ALL_TIME_KEY, universityId: null, from: null, to: now }];
  const active = await prisma.semester.findMany({ where: { endsAt: null } });
  for (const sem of active) {
    periods.push({
      type: "SEMESTER",
      key: semesterKey(sem.academicYear, sem.number),
      universityId: sem.universityId,
      from: sem.startsAt,
      to: now,
    });
    // The academic year runs from the start of its first semester.
    const yearSemesters = await prisma.semester.findMany({
      where: { universityId: sem.universityId, academicYear: sem.academicYear },
      select: { startsAt: true },
    });
    periods.push({
      type: "YEAR",
      key: sem.academicYear,
      universityId: sem.universityId,
      from: new Date(Math.min(...yearSemesters.map((s) => s.startsAt.getTime()))),
      to: now,
    });
  }
  return periods;
}

// Scores every eligible scribe for one period. Eligible = scribe, not banned,
// not demoted, not graduated, with at least one LIVE note.
async function scorePeriod(period: Period, now: Date): Promise<RankEntry[]> {
  const scribes = await prisma.user.findMany({
    where: {
      role: "SCRIBE",
      bannedAt: null,
      demotedAt: null,
      graduatedAt: null,
      ...(period.universityId ? { universityId: period.universityId } : {}),
      notes: { some: { status: "LIVE" } },
    },
    select: { id: true, universityId: true, departmentId: true },
  });

  const entries: RankEntry[] = [];
  for (const batch of chunk(scribes, BATCH)) {
    const ids = batch.map((s) => s.id);
    const notes = await prisma.note.findMany({
      where: { scribeId: { in: ids }, status: "LIVE" },
      select: { id: true, scribeId: true, createdAt: true },
    });
    const noteIds = notes.map((n) => n.id);
    const [purchases, reviews, followerCounts] = await Promise.all([
      prisma.purchase.findMany({
        where: { noteId: { in: noteIds } },
        select: { noteId: true, buyerId: true, purchasedAt: true, firstOpenedAt: true, refundedAt: true, disputedAt: true },
      }),
      prisma.review.findMany({
        where: { noteId: { in: noteIds } },
        select: {
          noteId: true,
          reviewerId: true,
          rating: true,
          createdAt: true,
          purchase: { select: { refundedAt: true, disputedAt: true } },
        },
      }),
      // Verified, unbanned followers who followed inside the period.
      prisma.follow.groupBy({
        by: ["scribeId"],
        where: {
          scribeId: { in: ids },
          follower: { emailVerifiedAt: { not: null }, bannedAt: null },
          ...(period.from ? { createdAt: { gte: period.from, lte: period.to } } : {}),
        },
        _count: { _all: true },
      }),
    ]);

    const scribeOfNote = new Map(notes.map((n) => [n.id, n.scribeId]));
    const followersOf = new Map(followerCounts.map((f) => [f.scribeId, f._count._all]));

    for (const scribe of batch) {
      const stats = aggregateScribeStats({
        scribeId: scribe.id,
        notes: notes.filter((n) => n.scribeId === scribe.id),
        purchases: purchases.filter((p) => scribeOfNote.get(p.noteId) === scribe.id),
        reviews: reviews
          .filter((r) => scribeOfNote.get(r.noteId) === scribe.id)
          .map((r) => ({
            noteId: r.noteId,
            reviewerId: r.reviewerId,
            rating: r.rating,
            createdAt: r.createdAt,
            purchaseRefundedAt: r.purchase.refundedAt,
            purchaseDisputedAt: r.purchase.disputedAt,
          })),
        followers: followersOf.get(scribe.id) ?? 0,
        from: period.from,
        to: period.to,
        now,
      });
      entries.push({
        scribeId: scribe.id,
        universityId: scribe.universityId,
        departmentId: scribe.departmentId,
        ...scoreScribe(stats),
        reachedScoreAt: now, // replaced from the saved snapshot below
      });
    }
  }
  return entries;
}

async function computeAll(now: Date): Promise<{ periods: number; scribes: number }> {
  // Periods that share a type and key (e.g. two schools both in "26/27-S1")
  // are ranked together, which is what makes the Global ranking possible.
  const groups = new Map<string, { type: PeriodType; key: string; entries: RankEntry[]; universityIds: string[] | null }>();
  for (const period of await buildPeriods(now)) {
    const id = `${period.type}|${period.key}`;
    const group = groups.get(id) ?? { type: period.type, key: period.key, entries: [], universityIds: [] };
    group.entries.push(...(await scorePeriod(period, now)));
    if (period.universityId === null) group.universityIds = null;
    else group.universityIds?.push(period.universityId);
    groups.set(id, group);
  }

  let scribes = 0;
  for (const group of groups.values()) {
    const existingRows = await prisma.leaderboardSnapshot.findMany({
      where: { periodType: group.type, periodKey: group.key },
    });
    const existing = new Map(existingRows.map((r) => [r.scribeId, r]));

    const carried = new Map<string, { reachedScoreAt: Date; previous: PreviousSnapshot | null }>();
    const entries = group.entries.map((e) => {
      const row = existing.get(e.scribeId);
      const c = carryOver(row ? (row as unknown as ExistingSnapshot) : null, e.finalScore, now);
      carried.set(e.scribeId, c);
      return { ...e, reachedScoreAt: c.reachedScoreAt };
    });
    const ranked = assignRanks(entries);
    scribes += ranked.length;

    const writes = ranked.map((r) => {
      const { previous } = carried.get(r.scribeId)!;
      const data = {
        universityId: r.universityId,
        departmentId: r.departmentId,
        ratingPoints: r.ratingPoints,
        purchasePoints: r.purchasePoints,
        readPoints: r.readPoints,
        followerPoints: r.followerPoints,
        growthPoints: r.growthPoints,
        finalScore: r.finalScore,
        reachedScoreAt: r.reachedScoreAt,
        rankDepartment: r.rankDepartment,
        rankSchool: r.rankSchool,
        rankGlobal: r.rankGlobal,
        previous: previous ? (previous as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        computedAt: now,
      };
      return prisma.leaderboardSnapshot.upsert({
        where: { scribeId_periodType_periodKey: { scribeId: r.scribeId, periodType: group.type, periodKey: group.key } },
        create: { scribeId: r.scribeId, periodType: group.type, periodKey: group.key, ...data },
        update: data,
      });
    });
    for (const part of chunk(writes, 100)) await prisma.$transaction(part);

    // Scribes who stopped being eligible (graduated, banned, demoted, no live
    // notes) drop off this period's board. Their earned badges are untouched.
    await prisma.leaderboardSnapshot.deleteMany({
      where: {
        periodType: group.type,
        periodKey: group.key,
        ...(group.universityIds ? { universityId: { in: group.universityIds } } : {}),
        scribeId: { notIn: ranked.map((r) => r.scribeId) },
      },
    });
  }
  return { periods: groups.size, scribes };
}

export type SnapshotRunResult =
  | { ran: true; periods: number; scribes: number }
  | { ran: false; reason: "fresh" | "busy" };

// Runs the job unless it already ran in the last 24 hours (force skips that
// check) or another instance is running it.
export async function runLeaderboardSnapshot(opts: { force?: boolean } = {}): Promise<SnapshotRunResult> {
  const now = new Date();
  const lock = await prisma.leaderboardLock.upsert({
    where: { id: LOCK_ID },
    create: { id: LOCK_ID, lockedUntil: new Date(0) },
    update: {},
  });
  if (!opts.force && lock.lastRunAt && now.getTime() - lock.lastRunAt.getTime() < FRESH_MS) {
    return { ran: false, reason: "fresh" };
  }
  const claimed = await prisma.leaderboardLock.updateMany({
    where: { id: LOCK_ID, lockedUntil: { lt: now } },
    data: { lockedUntil: new Date(now.getTime() + LOCK_MS) },
  });
  if (claimed.count !== 1) return { ran: false, reason: "busy" };

  // If this throws, the lock is deliberately left in place: it expires on its
  // own after LOCK_MS, which stops a failing job being retried on every request.
  const result = await computeAll(now);
  // Live all-time badges follow the fresh all-time ranking. A badge problem
  // must not fail the snapshot run, so it is logged and skipped.
  try {
    await syncAllTimeBadges();
  } catch (err) {
    console.error("all-time badge sync failed", err instanceof Error ? err.message : "unknown");
  }
  await prisma.leaderboardLock.update({
    where: { id: LOCK_ID },
    data: { lockedUntil: new Date(0), lastRunAt: new Date() },
  });
  return { ran: true, ...result };
}

// For the leaderboard API (phase L4): refresh if stale, never throw.
export async function ensureFreshLeaderboard(): Promise<void> {
  try {
    await runLeaderboardSnapshot();
  } catch (err) {
    console.error("leaderboard snapshot failed", err instanceof Error ? err.message : "unknown");
  }
}
