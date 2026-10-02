import { GROWTH_WINDOW_DAYS } from "./leaderboard-config";
import { compareScribes, type RankableScore, type ScribeStats, type NoteStats } from "./leaderboard-score";

// Pure helpers for the snapshot job (no database): turning raw rows into the
// counts the scoring module wants, assigning ranks, and carrying a scribe's
// hidden "reached this score at" time and previous-run numbers across runs.

const DAY_MS = 24 * 60 * 60 * 1000;
// A snapshot's "previous" numbers are only replaced once they are this old.
export const PREVIOUS_MIN_AGE_MS = 12 * 60 * 60 * 1000;

// ─── Period labels ──────────────────────────────────────────────────────

export const ALL_TIME_KEY = "all";
export const semesterKey = (academicYear: string, number: number) => `${academicYear}-S${number}`;

// ─── Raw rows → ScribeStats ─────────────────────────────────────────────

export interface RawNote {
  id: string;
  createdAt: Date;
}
export interface RawPurchase {
  noteId: string;
  buyerId: string;
  purchasedAt: Date;
  firstOpenedAt: Date | null;
  refundedAt: Date | null;
  disputedAt: Date | null;
}
export interface RawReview {
  noteId: string;
  reviewerId: string;
  rating: number;
  createdAt: Date;
  purchaseRefundedAt: Date | null;
  purchaseDisputedAt: Date | null;
}

export interface AggregateInput {
  scribeId: string;
  // The scribe's LIVE notes only.
  notes: RawNote[];
  purchases: RawPurchase[];
  reviews: RawReview[];
  // Followers who are verified and not banned, already limited to the period.
  followers: number;
  // Period window: from = null means "since the beginning".
  from: Date | null;
  to: Date;
  now: Date;
}

// Applies the counting rules: LIVE notes only (caller), refunded/disputed
// purchases and their reviews dropped, the scribe's own purchases dropped,
// each buyer counted once per note, events dated inside the period.
// Growth looks at the last GROWTH_WINDOW_DAYS regardless of the period.
export function aggregateScribeStats(input: AggregateInput): ScribeStats {
  const { scribeId, from, to, now } = input;
  const inPeriod = (d: Date) => (!from || d >= from) && d <= to;
  const recentFrom = new Date(now.getTime() - GROWTH_WINDOW_DAYS * DAY_MS);

  const noteIds = new Set(input.notes.map((n) => n.id));
  const qualifying = input.purchases.filter(
    (p) => noteIds.has(p.noteId) && !p.refundedAt && !p.disputedAt && p.buyerId !== scribeId
  );

  const buyersByNote = new Map<string, Set<string>>();
  const readersByNote = new Map<string, Set<string>>();
  const recentBuyers = new Set<string>();
  for (const p of qualifying) {
    if (inPeriod(p.purchasedAt)) {
      (buyersByNote.get(p.noteId) ?? buyersByNote.set(p.noteId, new Set()).get(p.noteId)!).add(p.buyerId);
    }
    if (p.firstOpenedAt && inPeriod(p.firstOpenedAt)) {
      (readersByNote.get(p.noteId) ?? readersByNote.set(p.noteId, new Set()).get(p.noteId)!).add(p.buyerId);
    }
    if (p.purchasedAt >= recentFrom && p.purchasedAt <= now) recentBuyers.add(p.buyerId);
  }

  const ratingsByNote = new Map<string, number[]>();
  for (const r of input.reviews) {
    if (!noteIds.has(r.noteId) || r.purchaseRefundedAt || r.purchaseDisputedAt) continue;
    if (r.reviewerId === scribeId || !inPeriod(r.createdAt)) continue;
    (ratingsByNote.get(r.noteId) ?? ratingsByNote.set(r.noteId, []).get(r.noteId)!).push(r.rating);
  }

  const notes: NoteStats[] = input.notes.map((n) => ({
    ratings: ratingsByNote.get(n.id) ?? [],
    buyers: buyersByNote.get(n.id)?.size ?? 0,
    readers: readersByNote.get(n.id)?.size ?? 0,
  }));

  return {
    notes,
    followers: input.followers,
    recentBuyers: recentBuyers.size,
    recentUploads: input.notes.filter((n) => n.createdAt >= recentFrom && n.createdAt <= now).length,
  };
}

// ─── Ranking ────────────────────────────────────────────────────────────

export interface RankEntry extends RankableScore {
  scribeId: string;
  universityId: string;
  departmentId: string | null;
}
export interface RankedEntry extends RankEntry {
  rankGlobal: number;
  rankSchool: number;
  rankDepartment: number | null;
}

// Every scribe passed in competes in the same period. Ranks are 1, 2, 3 … with
// no shared places (the comparator always ends in a tie-break). Department
// ranks only exist for scribes who have a department.
export function assignRanks(entries: RankEntry[]): RankedEntry[] {
  const sorted = [...entries].sort(compareScribes);
  const schoolCount = new Map<string, number>();
  const deptCount = new Map<string, number>();
  return sorted.map((e, i) => {
    const rankSchool = (schoolCount.get(e.universityId) ?? 0) + 1;
    schoolCount.set(e.universityId, rankSchool);
    let rankDepartment: number | null = null;
    if (e.departmentId) {
      const key = `${e.universityId}|${e.departmentId}`;
      rankDepartment = (deptCount.get(key) ?? 0) + 1;
      deptCount.set(key, rankDepartment);
    }
    return { ...e, rankGlobal: i + 1, rankSchool, rankDepartment };
  });
}

// ─── Carrying values across runs ────────────────────────────────────────

export interface PreviousSnapshot {
  finalScore: number;
  ratingPoints: number;
  purchasePoints: number;
  readPoints: number;
  followerPoints: number;
  growthPoints: number;
  rankDepartment: number | null;
  rankSchool: number | null;
  rankGlobal: number | null;
  computedAt: string;
}

export interface ExistingSnapshot extends Omit<PreviousSnapshot, "computedAt"> {
  computedAt: Date;
  reachedScoreAt: Date;
  previous: PreviousSnapshot | null;
}

// reachedScoreAt only moves when the score actually changes. `previous` is the
// last run's numbers, refreshed at most every PREVIOUS_MIN_AGE_MS.
export function carryOver(
  existing: ExistingSnapshot | null,
  finalScore: number,
  now: Date
): { reachedScoreAt: Date; previous: PreviousSnapshot | null } {
  if (!existing) return { reachedScoreAt: now, previous: null };
  const reachedScoreAt = existing.finalScore === finalScore ? existing.reachedScoreAt : now;
  const oldEnough = now.getTime() - existing.computedAt.getTime() >= PREVIOUS_MIN_AGE_MS;
  const previous = oldEnough
    ? {
        finalScore: existing.finalScore,
        ratingPoints: existing.ratingPoints,
        purchasePoints: existing.purchasePoints,
        readPoints: existing.readPoints,
        followerPoints: existing.followerPoints,
        growthPoints: existing.growthPoints,
        rankDepartment: existing.rankDepartment,
        rankSchool: existing.rankSchool,
        rankGlobal: existing.rankGlobal,
        computedAt: existing.computedAt.toISOString(),
      }
    : existing.previous;
  return { reachedScoreAt, previous };
}
