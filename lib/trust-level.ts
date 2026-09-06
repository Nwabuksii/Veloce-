// Starter trust-level scheme (founder-confirmed: sales + rating based).
// Thresholds are a reasonable first pass — tune once real scribe data exists.

export type TrustLevel = "NEW" | "RISING" | "TRUSTED" | "ELITE";

const LABELS: Record<TrustLevel, string> = {
  NEW: "New Scribe",
  RISING: "Rising Scribe",
  TRUSTED: "Trusted Scribe",
  ELITE: "Elite Scribe",
};

interface TrustInput {
  salesCount: number;
  avgRating: number | null;
  hasRejectedNote: boolean;
}

export function computeTrustLevel({ salesCount, avgRating, hasRejectedNote }: TrustInput): {
  level: TrustLevel;
  label: string;
} {
  const rating = avgRating ?? 0;

  let level: TrustLevel = "NEW";
  if (salesCount >= 50 && rating >= 4.5) level = "ELITE";
  else if (salesCount >= 20 && rating >= 4.0) level = "TRUSTED";
  else if (salesCount >= 5 && rating >= 3.5) level = "RISING";

  // A note that failed moderation caps trust below Trusted/Elite until it
  // ages out of relevance — simple starter penalty, not a permanent one.
  if (hasRejectedNote && (level === "TRUSTED" || level === "ELITE")) {
    level = "RISING";
  }

  return { level, label: LABELS[level] };
}
