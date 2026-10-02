import {
  WEIGHTS,
  PARS,
  MIN_REVIEWS_PER_NOTE,
  PRIOR_MEAN,
  PRIOR_WEIGHT,
  BEST_NOTES,
  BEYOND_BEST_FACTOR,
  GROWTH_MAX_UPLOADS,
} from "./leaderboard-config";

// Pure scoring for the Scribe Leaderboard — no database, no dates. The
// snapshot job (phase L3) does the querying and hands this the counts.
// It must already have applied the counting rules: LIVE notes only, refunded
// or disputed purchases removed, self-purchases removed, each buyer counted
// once per note.

export interface NoteStats {
  // 1–5 stars from verified buyers (one review per purchase).
  ratings: number[];
  // Distinct qualifying buyers of this note.
  buyers: number;
  // Of those, distinct buyers who ever opened it (Purchase.firstOpenedAt).
  readers: number;
}

export interface ScribeStats {
  notes: NoteStats[];
  // Followers who are verified and not banned.
  followers: number;
  // Distinct qualifying buyers across all the scribe's notes, last 30 days.
  recentBuyers: number;
  // New LIVE uploads in the last 30 days.
  recentUploads: number;
}

export interface ScribeScore {
  ratingPoints: number;
  purchasePoints: number;
  readPoints: number;
  followerPoints: number;
  growthPoints: number;
  finalScore: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Smoothed average: (PRIOR_WEIGHT × PRIOR_MEAN + sum) ÷ (PRIOR_WEIGHT + count).
export function smoothedAverage(ratings: number[]): number {
  const sum = ratings.reduce((a, b) => a + b, 0);
  return (PRIOR_WEIGHT * PRIOR_MEAN + sum) / (PRIOR_WEIGHT + ratings.length);
}

// Smooth curve instead of step bands: −3 at 1.0, rising to 0 at 3.0; flat 0
// from 3.0 to 4.0 (an average note earns nothing); then up to +4 at 5.0.
export function pointsForAverage(avg: number): number {
  if (avg < 3) return -3 + 1.5 * (avg - 1);
  if (avg <= 4) return 0;
  return 4 * (avg - 4);
}

// A note with fewer than MIN_REVIEWS_PER_NOTE reviews scores 0, never negative.
export function noteRatingPoints(ratings: number[]): number {
  if (ratings.length < MIN_REVIEWS_PER_NOTE) return 0;
  return pointsForAverage(smoothedAverage(ratings));
}

// Sum of note rating points. Positive points beyond the best BEST_NOTES notes
// count at BEYOND_BEST_FACTOR; negative points always count in full.
export function ratingRaw(notes: NoteStats[]): number {
  const points = notes.map((n) => noteRatingPoints(n.ratings));
  const positives = points.filter((p) => p > 0).sort((a, b) => b - a);
  const negatives = points.filter((p) => p < 0);
  const pos = positives.reduce((sum, p, i) => sum + (i < BEST_NOTES ? p : p * BEYOND_BEST_FACTOR), 0);
  const neg = negatives.reduce((a, b) => a + b, 0);
  return pos + neg;
}

const sqrtSum = (values: number[]) => values.reduce((sum, v) => sum + Math.sqrt(Math.max(0, v)), 0);

export function scoreScribe(stats: ScribeStats): ScribeScore {
  const rRaw = ratingRaw(stats.notes);
  const ratingWeight = rRaw > 0 ? WEIGHTS.ratingPositive : WEIGHTS.ratingNegative;
  const ratingPoints = rRaw === 0 ? 0 : (ratingWeight * rRaw) / PARS.rating;

  // √ per note, then summed: ten buyers on each of five notes beats fifty
  // buyers on one viral note.
  const purchasePoints = (WEIGHTS.purchases * sqrtSum(stats.notes.map((n) => n.buyers))) / PARS.purchases;
  const readPoints = (WEIGHTS.reads * sqrtSum(stats.notes.map((n) => n.readers))) / PARS.reads;
  const followerPoints = (WEIGHTS.followers * Math.sqrt(Math.max(0, stats.followers))) / PARS.followers;
  const growthRaw =
    Math.sqrt(Math.max(0, stats.recentBuyers)) + Math.min(GROWTH_MAX_UPLOADS, Math.max(0, stats.recentUploads));
  const growthPoints = (WEIGHTS.growth * growthRaw) / PARS.growth;

  const finalScore = ratingPoints + purchasePoints + readPoints + followerPoints + growthPoints;
  return {
    ratingPoints: round2(ratingPoints),
    purchasePoints: round2(purchasePoints),
    readPoints: round2(readPoints),
    followerPoints: round2(followerPoints),
    growthPoints: round2(growthPoints),
    finalScore: round2(finalScore),
  };
}

export interface RankableScore extends ScribeScore {
  // When the scribe first reached this finalScore (hidden last tie-break).
  reachedScoreAt: Date;
}

// Sort comparator, best first. Order: final score → rating → purchases →
// followers → reads → growth → whoever reached the score first. Tied scribes
// show the same score; no points are added to separate them.
export function compareScribes(a: RankableScore, b: RankableScore): number {
  return (
    b.finalScore - a.finalScore ||
    b.ratingPoints - a.ratingPoints ||
    b.purchasePoints - a.purchasePoints ||
    b.followerPoints - a.followerPoints ||
    b.readPoints - a.readPoints ||
    b.growthPoints - a.growthPoints ||
    a.reachedScoreAt.getTime() - b.reachedScoreAt.getTime()
  );
}
