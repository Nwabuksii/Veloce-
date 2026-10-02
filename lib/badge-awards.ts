import { prisma } from "@/lib/prisma";
import { ALL_TIME_KEY, semesterKey } from "./leaderboard-rank";
import { badgeLabel, badgeTitle, globalLevelAwards, schoolLevelAwards, type Award, type BadgeRow } from "./badges";

// The database side of the badge engine. Awarding is idempotent: ScribeBadge
// is unique on (scribe, badgeKey, periodType, periodKey), so running any of
// these twice never creates duplicates. Badges are read from the leaderboard
// snapshots — run `runLeaderboardSnapshot({ force: true })` first when the
// period is closing (start-semester does).

type PeriodType = "ALL_TIME" | "SEMESTER" | "YEAR";

async function loadRows(periodType: PeriodType, periodKey: string, universityId?: string): Promise<BadgeRow[]> {
  const rows = await prisma.leaderboardSnapshot.findMany({
    where: { periodType, periodKey, ...(universityId ? { universityId } : {}) },
  });
  return rows.map((r) => ({
    scribeId: r.scribeId,
    universityId: r.universityId,
    departmentId: r.departmentId,
    ratingPoints: r.ratingPoints,
    purchasePoints: r.purchasePoints,
    readPoints: r.readPoints,
    followerPoints: r.followerPoints,
    growthPoints: r.growthPoints,
    finalScore: r.finalScore,
    reachedScoreAt: r.reachedScoreAt,
  }));
}

// Saves badges and tells each scribe about the NEW ones (an in-app message, the
// same mechanism as "a scribe you follow published new notes"). Badges that
// already exist are skipped silently, so re-running never re-notifies.
async function save(awards: Award[], periodType: PeriodType, periodKey: string): Promise<number> {
  if (awards.length === 0) return 0;

  const existing = await prisma.scribeBadge.findMany({
    where: { periodType, periodKey, scribeId: { in: [...new Set(awards.map((a) => a.scribeId))] } },
    select: { scribeId: true, badgeKey: true },
  });
  const have = new Set(existing.map((e) => `${e.scribeId}|${e.badgeKey}`));
  const fresh = awards.filter((a) => !have.has(`${a.scribeId}|${a.badgeKey}`));
  if (fresh.length === 0) return 0;

  const result = await prisma.scribeBadge.createMany({
    data: fresh.map((a) => ({ scribeId: a.scribeId, badgeKey: a.badgeKey, periodType, periodKey })),
    skipDuplicates: true,
  });

  try {
    await notifyEarned(fresh, periodType, periodKey);
  } catch (err) {
    console.error("badge notice failed", err instanceof Error ? err.message : "unknown");
  }
  return result.count;
}

async function notifyEarned(fresh: Award[], periodType: PeriodType, periodKey: string): Promise<void> {
  const byScribe = new Map<string, string[]>();
  for (const a of fresh) byScribe.set(a.scribeId, [...(byScribe.get(a.scribeId) ?? []), a.badgeKey]);

  const label = badgeLabel(periodType, periodKey);
  await prisma.adminMessage.createMany({
    data: [...byScribe].map(([scribeId, keys]) => ({
      recipientId: scribeId,
      senderId: null,
      subject: keys.length === 1 ? "You earned a new badge" : `You earned ${keys.length} new badges`,
      body: `${keys.map((k) => `• ${badgeTitle(k)} · ${label}`).join("\n")}\n\nYou can pin up to 5 badges to your public profile from your profile page.`,
    })),
  });
}

// A closed semester: Department / School placement and School-scope category
// badges for that school, plus Consecutive Department Leader when S2 closes.
// When S2 closes it also tries to close the academic year (Global badges).
export async function awardSemesterBadges(universityId: string, academicYear: string, number: number): Promise<number> {
  const key = semesterKey(academicYear, number);
  const rows = await loadRows("SEMESTER", key, universityId);
  let count = await save(schoolLevelAwards(rows), "SEMESTER", key);

  if (number === 2) {
    // 1st in the department in BOTH semesters of this academic year.
    const firsts = await prisma.scribeBadge.findMany({
      where: {
        badgeKey: "DEPARTMENT_1",
        periodType: "SEMESTER",
        periodKey: { in: [semesterKey(academicYear, 1), key] },
        scribe: { universityId },
      },
      select: { scribeId: true, periodKey: true },
    });
    const seen = new Map<string, Set<string>>();
    for (const f of firsts) seen.set(f.scribeId, (seen.get(f.scribeId) ?? new Set()).add(f.periodKey));
    const both = [...seen].filter(([, keys]) => keys.size === 2).map(([scribeId]) => ({ scribeId, badgeKey: "CONSECUTIVE_DEPARTMENT" }));
    count += await save(both, "SEMESTER", key);

    count += await awardYearBadges(academicYear);
  }
  return count;
}

// Global placement + Global-scope category badges for an academic year. Only
// when more than one school exists, and only once EVERY school that has a
// semester in that year has closed it (otherwise the ranking is incomplete —
// the last school to close triggers it).
export async function awardYearBadges(academicYear: string): Promise<number> {
  const [universities, stillOpen] = await Promise.all([
    prisma.university.count(),
    prisma.semester.count({ where: { academicYear, endsAt: null } }),
  ]);
  if (universities < 2 || stillOpen > 0) return 0;
  return save(globalLevelAwards(await loadRows("YEAR", academicYear)), "YEAR", academicYear);
}

// All-time badges are live: held while the spot is held. Re-derived from the
// all-time snapshot after every leaderboard run. Someone who is still ranked
// but lost a spot loses that badge; someone who left the rankings (graduated,
// banned, demoted) keeps what they hold — earned badges are never revoked.
export async function syncAllTimeBadges(): Promise<void> {
  const [rows, universities] = await Promise.all([loadRows("ALL_TIME", ALL_TIME_KEY), prisma.university.count()]);

  const byUniversity = new Map<string, BadgeRow[]>();
  for (const r of rows) byUniversity.set(r.universityId, [...(byUniversity.get(r.universityId) ?? []), r]);

  const desired: Award[] = [...byUniversity.values()].flatMap(schoolLevelAwards);
  if (universities > 1) desired.push(...globalLevelAwards(rows));

  const want = new Set(desired.map((a) => `${a.scribeId}|${a.badgeKey}`));
  const ranked = new Set(rows.map((r) => r.scribeId));

  const current = await prisma.scribeBadge.findMany({
    where: { periodType: "ALL_TIME", periodKey: ALL_TIME_KEY },
    select: { id: true, scribeId: true, badgeKey: true },
  });
  const lost = current.filter((c) => ranked.has(c.scribeId) && !want.has(`${c.scribeId}|${c.badgeKey}`)).map((c) => c.id);
  if (lost.length > 0) await prisma.scribeBadge.deleteMany({ where: { id: { in: lost } } });

  await save(desired, "ALL_TIME", ALL_TIME_KEY);
}
