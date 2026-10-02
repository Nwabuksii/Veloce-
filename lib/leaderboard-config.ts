// Every number the Scribe Leaderboard score depends on, in one place.
// Points for a metric = weight × (raw ÷ par). Nothing is capped: a raw value
// above its par simply earns more than the full weight.
//
// The par values are STARTING values. Tune them against real data before the
// leaderboard goes live (see LEADERBOARD_HANDOFF.md, phase L2/L7).

export const WEIGHTS = {
  ratingPositive: 35,
  ratingNegative: 20,
  purchases: 30,
  reads: 15,
  growth: 15,
  followers: 5,
} as const;

export const PARS = {
  rating: 8,
  purchases: 25,
  reads: 20,
  followers: 15,
  growth: 6,
} as const;

// A note's rating only counts once it has this many reviews.
export const MIN_REVIEWS_PER_NOTE = 3;

// Smoothing: a note's average is pulled toward PRIOR_MEAN as if it already
// had PRIOR_WEIGHT reviews at that mean, so 3 early 5★ reviews don't read
// as a perfect note.
export const PRIOR_MEAN = 3.5;
export const PRIOR_WEIGHT = 3;

// Only a scribe's best N rated notes count at full value; the rest count at
// BEYOND_BEST_FACTOR (positive points only — bad notes always count fully).
export const BEST_NOTES = 10;
export const BEYOND_BEST_FACTOR = 0.5;

// Growth/Activity looks at this many recent days, and counts at most this
// many new uploads inside that window.
export const GROWTH_WINDOW_DAYS = 30;
export const GROWTH_MAX_UPLOADS = 2;
