import { describe, it, expect } from "vitest";
import {
  aggregateScribeStats,
  assignRanks,
  carryOver,
  semesterKey,
  PREVIOUS_MIN_AGE_MS,
  type AggregateInput,
  type RawPurchase,
  type RankEntry,
  type ExistingSnapshot,
} from "./leaderboard-rank";

const d = (s: string) => new Date(s);
const NOW = d("2026-10-30T12:00:00Z");

const purchase = (over: Partial<RawPurchase> = {}): RawPurchase => ({
  noteId: "n1",
  buyerId: "b1",
  purchasedAt: d("2026-10-20T00:00:00Z"),
  firstOpenedAt: null,
  refundedAt: null,
  disputedAt: null,
  ...over,
});

const input = (over: Partial<AggregateInput> = {}): AggregateInput => ({
  scribeId: "s1",
  notes: [{ id: "n1", createdAt: d("2026-01-01T00:00:00Z") }],
  purchases: [],
  reviews: [],
  followers: 0,
  from: null,
  to: NOW,
  now: NOW,
  ...over,
});

describe("aggregateScribeStats", () => {
  it("drops refunded, disputed and self purchases and counts each buyer once", () => {
    const stats = aggregateScribeStats(
      input({
        purchases: [
          purchase({ buyerId: "a" }),
          purchase({ buyerId: "a" }), // same buyer twice
          purchase({ buyerId: "b", refundedAt: d("2026-10-21T00:00:00Z") }),
          purchase({ buyerId: "c", disputedAt: d("2026-10-21T00:00:00Z") }),
          purchase({ buyerId: "s1" }), // the scribe themself
          purchase({ buyerId: "d" }),
        ],
      })
    );
    expect(stats.notes[0].buyers).toBe(2); // a and d
  });

  it("counts a read only when the buyer ever opened the note", () => {
    const stats = aggregateScribeStats(
      input({
        purchases: [
          purchase({ buyerId: "a", firstOpenedAt: d("2026-10-22T00:00:00Z") }),
          purchase({ buyerId: "b" }),
        ],
      })
    );
    expect(stats.notes[0].buyers).toBe(2);
    expect(stats.notes[0].readers).toBe(1);
  });

  it("ignores reviews on refunded purchases and keeps the rest", () => {
    const base = { noteId: "n1", createdAt: d("2026-10-22T00:00:00Z"), purchaseRefundedAt: null, purchaseDisputedAt: null };
    const stats = aggregateScribeStats(
      input({
        reviews: [
          { ...base, reviewerId: "a", rating: 5 },
          { ...base, reviewerId: "b", rating: 4, purchaseRefundedAt: d("2026-10-23T00:00:00Z") },
          { ...base, reviewerId: "c", rating: 3, purchaseDisputedAt: d("2026-10-23T00:00:00Z") },
        ],
      })
    );
    expect(stats.notes[0].ratings).toEqual([5]);
  });

  it("only counts events inside the semester window", () => {
    const stats = aggregateScribeStats(
      input({
        from: d("2026-09-01T00:00:00Z"),
        purchases: [
          purchase({ buyerId: "old", purchasedAt: d("2026-06-01T00:00:00Z") }),
          purchase({ buyerId: "new", purchasedAt: d("2026-10-01T00:00:00Z") }),
        ],
      })
    );
    expect(stats.notes[0].buyers).toBe(1);
  });

  it("measures growth over the last 30 days whatever the window is", () => {
    const stats = aggregateScribeStats(
      input({
        from: d("2026-09-01T00:00:00Z"),
        notes: [
          { id: "n1", createdAt: d("2026-10-25T00:00:00Z") }, // new upload
          { id: "n2", createdAt: d("2026-02-01T00:00:00Z") },
        ],
        purchases: [
          purchase({ buyerId: "recent", purchasedAt: d("2026-10-25T00:00:00Z") }),
          purchase({ buyerId: "older", purchasedAt: d("2026-09-05T00:00:00Z") }),
        ],
      })
    );
    expect(stats.recentBuyers).toBe(1);
    expect(stats.recentUploads).toBe(1);
  });

  it("counts a buyer of two notes once in recent buyers", () => {
    const stats = aggregateScribeStats(
      input({
        notes: [
          { id: "n1", createdAt: d("2026-01-01T00:00:00Z") },
          { id: "n2", createdAt: d("2026-01-01T00:00:00Z") },
        ],
        purchases: [purchase({ noteId: "n1", buyerId: "x" }), purchase({ noteId: "n2", buyerId: "x" })],
      })
    );
    expect(stats.recentBuyers).toBe(1);
  });

  it("ignores purchases of notes that are not in the scribe's live list", () => {
    const stats = aggregateScribeStats(input({ purchases: [purchase({ noteId: "other" })] }));
    expect(stats.notes[0].buyers).toBe(0);
  });
});

describe("assignRanks", () => {
  const entry = (id: string, uni: string, dept: string | null, score: number, reached = 1): RankEntry => ({
    scribeId: id,
    universityId: uni,
    departmentId: dept,
    ratingPoints: 0,
    purchasePoints: 0,
    readPoints: 0,
    followerPoints: 0,
    growthPoints: 0,
    finalScore: score,
    reachedScoreAt: new Date(2026, 0, reached),
  });

  it("ranks globally, per school and per department", () => {
    const ranked = assignRanks([
      entry("a", "u1", "d1", 50),
      entry("b", "u2", "d9", 90),
      entry("c", "u1", "d1", 70),
      entry("d", "u1", "d2", 60),
    ]);
    const by = Object.fromEntries(ranked.map((r) => [r.scribeId, r]));
    expect(by.b.rankGlobal).toBe(1);
    expect(by.c.rankGlobal).toBe(2);
    expect(by.d.rankGlobal).toBe(3);
    expect(by.a.rankGlobal).toBe(4);
    expect(by.c.rankSchool).toBe(1);
    expect(by.d.rankSchool).toBe(2);
    expect(by.a.rankSchool).toBe(3);
    expect(by.b.rankSchool).toBe(1); // alone in u2
    expect(by.c.rankDepartment).toBe(1);
    expect(by.a.rankDepartment).toBe(2);
    expect(by.d.rankDepartment).toBe(1);
  });

  it("gives scribes with no department a school rank but no department rank", () => {
    const [r] = assignRanks([entry("a", "u1", null, 10)]);
    expect(r.rankSchool).toBe(1);
    expect(r.rankDepartment).toBe(null);
  });

  it("separates tied scores by who reached them first", () => {
    const ranked = assignRanks([entry("late", "u1", "d1", 40, 9), entry("early", "u1", "d1", 40, 2)]);
    expect(ranked[0].scribeId).toBe("early");
    expect(ranked[0].rankGlobal).toBe(1);
    expect(ranked[1].rankGlobal).toBe(2);
    expect(ranked[0].finalScore).toBe(ranked[1].finalScore);
  });
});

describe("carryOver", () => {
  const existing = (over: Partial<ExistingSnapshot> = {}): ExistingSnapshot => ({
    finalScore: 20,
    ratingPoints: 10,
    purchasePoints: 5,
    readPoints: 2,
    followerPoints: 1,
    growthPoints: 2,
    rankDepartment: 2,
    rankSchool: 3,
    rankGlobal: 4,
    computedAt: new Date(NOW.getTime() - PREVIOUS_MIN_AGE_MS - 1000),
    reachedScoreAt: d("2026-10-01T00:00:00Z"),
    previous: null,
    ...over,
  });

  it("starts fresh for a scribe with no earlier snapshot", () => {
    const c = carryOver(null, 20, NOW);
    expect(c.reachedScoreAt).toBe(NOW);
    expect(c.previous).toBe(null);
  });

  it("keeps reachedScoreAt while the score is unchanged and resets it when it changes", () => {
    expect(carryOver(existing(), 20, NOW).reachedScoreAt).toEqual(d("2026-10-01T00:00:00Z"));
    expect(carryOver(existing(), 21, NOW).reachedScoreAt).toBe(NOW);
  });

  it("saves the last run as 'previous' once it is old enough", () => {
    const c = carryOver(existing(), 25, NOW);
    expect(c.previous?.finalScore).toBe(20);
    expect(c.previous?.rankSchool).toBe(3);
  });

  it("keeps the older 'previous' when the last run was only minutes ago", () => {
    const earlier = { ...existing().previous, finalScore: 15 } as any;
    const recent = existing({ computedAt: new Date(NOW.getTime() - 60_000), previous: earlier });
    expect(carryOver(recent, 25, NOW).previous?.finalScore).toBe(15);
  });
});

describe("semesterKey", () => {
  it("matches the label format used by Semester rows", () => {
    expect(semesterKey("26/27", 1)).toBe("26/27-S1");
  });
});
