import { describe, it, expect } from "vitest";
import {
  smoothedAverage,
  pointsForAverage,
  noteRatingPoints,
  ratingRaw,
  scoreScribe,
  compareScribes,
  type NoteStats,
  type ScribeStats,
} from "./leaderboard-score";

const note = (over: Partial<NoteStats> = {}): NoteStats => ({ ratings: [], buyers: 0, readers: 0, ...over });
const scribe = (notes: NoteStats[], over: Partial<ScribeStats> = {}): ScribeStats => ({
  notes,
  followers: 0,
  recentBuyers: 0,
  recentUploads: 0,
  ...over,
});

describe("rating curve", () => {
  it("hits the anchor points", () => {
    expect(pointsForAverage(1)).toBeCloseTo(-3);
    expect(pointsForAverage(2)).toBeCloseTo(-1.5);
    expect(pointsForAverage(3)).toBeCloseTo(0);
    expect(pointsForAverage(3.5)).toBe(0);
    expect(pointsForAverage(4)).toBe(0);
    expect(pointsForAverage(5)).toBeCloseTo(4);
  });

  it("scores a note with fewer than 3 reviews as 0, never negative", () => {
    expect(noteRatingPoints([])).toBe(0);
    expect(noteRatingPoints([1])).toBe(0);
    expect(noteRatingPoints([5, 5])).toBe(0);
  });

  it("does not hand out a perfect score for three early 5-star reviews", () => {
    expect(smoothedAverage([5, 5, 5])).toBeCloseTo(4.25);
    expect(noteRatingPoints([5, 5, 5])).toBeCloseTo(1);
    expect(noteRatingPoints(Array(30).fill(5))).toBeGreaterThan(3);
  });

  it("gives an average (3.0–4.0) note nothing", () => {
    expect(noteRatingPoints([3, 4, 3, 4])).toBe(0);
  });
});

describe("best-10 rule", () => {
  it("counts positive notes beyond the best 10 at half value", () => {
    const good = (): NoteStats => note({ ratings: Array(30).fill(5) });
    const one = noteRatingPoints(good().ratings);
    const twelve = ratingRaw(Array.from({ length: 12 }, good));
    expect(twelve).toBeCloseTo(10 * one + 2 * one * 0.5);
  });

  it("always counts negative notes in full", () => {
    const bad = (): NoteStats => note({ ratings: Array(30).fill(1) });
    const one = noteRatingPoints(bad().ratings);
    expect(ratingRaw(Array.from({ length: 12 }, bad))).toBeCloseTo(12 * one);
  });
});

describe("sustained beats viral", () => {
  it("five notes with 10 buyers each outscore one note with 100 buyers", () => {
    const viral = scoreScribe(scribe([note({ buyers: 100 })]));
    const steady = scoreScribe(scribe(Array.from({ length: 5 }, () => note({ buyers: 10 }))));
    expect(steady.purchasePoints).toBeGreaterThan(viral.purchasePoints);
  });

  it("matches the hand calculation for purchases", () => {
    // 30 × √100 ÷ 25 = 12
    expect(scoreScribe(scribe([note({ buyers: 100 })])).purchasePoints).toBeCloseTo(12);
  });
});

describe("the original five-note example", () => {
  it("is positive overall and scored with the 35 multiplier", () => {
    // Averages 2.5, 3.2, 4.6, 4.1, 5.0 — built from enough reviews (20 each)
    // that smoothing barely moves them.
    const withAverage = (avg: number) => {
      const fives = Math.round((avg - 1) / 4 * 20);
      return note({ ratings: [...Array(fives).fill(5), ...Array(20 - fives).fill(1)] });
    };
    const notes = [2.5, 3.2, 4.6, 4.1, 5.0].map(withAverage);
    const raw = ratingRaw(notes);
    expect(raw).toBeGreaterThan(0);
    expect(scoreScribe(scribe(notes)).ratingPoints).toBeCloseTo((35 * raw) / 8, 1);
  });
});

describe("other metrics", () => {
  it("scores reads, followers and growth from their raw values", () => {
    const s = scoreScribe(scribe([note({ buyers: 16, readers: 16 })], { followers: 225, recentBuyers: 9, recentUploads: 5 }));
    expect(s.readPoints).toBeCloseTo((15 * 4) / 20); // 15 × √16 ÷ 20 = 3
    expect(s.followerPoints).toBeCloseTo((5 * 15) / 15); // 5 × √225 ÷ 15 = 5
    expect(s.growthPoints).toBeCloseTo((15 * (3 + 2)) / 6); // uploads capped at 2
  });

  it("final score is the sum of the five parts", () => {
    const s = scoreScribe(scribe([note({ ratings: Array(10).fill(5), buyers: 9, readers: 6 })], { followers: 4, recentBuyers: 1 }));
    expect(s.finalScore).toBeCloseTo(s.ratingPoints + s.purchasePoints + s.readPoints + s.followerPoints + s.growthPoints, 1);
  });

  it("an empty scribe scores 0", () => {
    expect(scoreScribe(scribe([])).finalScore).toBe(0);
  });
});

describe("tie-break", () => {
  const base = { ratingPoints: 0, purchasePoints: 0, readPoints: 0, followerPoints: 0, growthPoints: 0, finalScore: 10 };
  const t = (n: number) => new Date(2026, 0, n);

  it("ranks by rating points first, then purchases, followers, reads, growth", () => {
    const a = { ...base, ratingPoints: 5, reachedScoreAt: t(2) };
    const b = { ...base, ratingPoints: 4, purchasePoints: 9, reachedScoreAt: t(1) };
    expect(compareScribes(a, b)).toBeLessThan(0);

    const c = { ...base, purchasePoints: 3, reachedScoreAt: t(2) };
    const d = { ...base, purchasePoints: 2, followerPoints: 9, reachedScoreAt: t(1) };
    expect(compareScribes(c, d)).toBeLessThan(0);

    const e = { ...base, followerPoints: 3, reachedScoreAt: t(2) };
    const f = { ...base, followerPoints: 2, readPoints: 9, reachedScoreAt: t(1) };
    expect(compareScribes(e, f)).toBeLessThan(0);

    const g = { ...base, readPoints: 3, reachedScoreAt: t(2) };
    const h = { ...base, readPoints: 2, growthPoints: 9, reachedScoreAt: t(1) };
    expect(compareScribes(g, h)).toBeLessThan(0);

    const i = { ...base, growthPoints: 3, reachedScoreAt: t(2) };
    const j = { ...base, growthPoints: 2, reachedScoreAt: t(1) };
    expect(compareScribes(i, j)).toBeLessThan(0);
  });

  it("falls back to whoever reached the score first, without changing scores", () => {
    const early = { ...base, reachedScoreAt: t(1) };
    const late = { ...base, reachedScoreAt: t(5) };
    expect(compareScribes(early, late)).toBeLessThan(0);
    expect(early.finalScore).toBe(late.finalScore);
  });

  it("a higher final score always wins", () => {
    const hi = { ...base, finalScore: 11, reachedScoreAt: t(9) };
    const lo = { ...base, finalScore: 10, ratingPoints: 50, reachedScoreAt: t(1) };
    expect(compareScribes(hi, lo)).toBeLessThan(0);
  });
});
