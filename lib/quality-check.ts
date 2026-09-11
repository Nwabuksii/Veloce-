// Lightweight automated quality gate — no external AI call needed to start.
// - Completeness: flags uploads that look too short to be real course notes.
// - Similarity: flags likely-duplicate uploads within the same block, using
//   Jaccard similarity over word sets (cheap, no embeddings/API required).
// This can be swapped for a real AI pass later without touching callers —
// runQualityGate's signature stays the same either way.

const MIN_WORD_COUNT = 150;
const SIMILARITY_FLAG_THRESHOLD = 0.75;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function toWordSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2) // skip tiny/common words
  );
}

export function jaccardSimilarity(a: string, b: string): number {
  const setA = toWordSet(a);
  const setB = toWordSet(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const word of setA) if (setB.has(word)) intersection++;
  const union = setA.size + setB.size - intersection;

  return union === 0 ? 0 : intersection / union;
}

export interface QualityResult {
  wordCount: number;
  maxSimilarity: number;
  flagged: boolean;
  qualityScore: number; // 0-1, rough completeness proxy
}

export function runQualityGate(newText: string, existingTexts: string[]): QualityResult {
  const wc = wordCount(newText);
  const maxSimilarity = existingTexts.reduce((max, t) => Math.max(max, jaccardSimilarity(newText, t)), 0);

  const flagged = wc < MIN_WORD_COUNT || maxSimilarity > SIMILARITY_FLAG_THRESHOLD;
  const qualityScore = Math.min(wc / 500, 1);

  return { wordCount: wc, maxSimilarity, flagged, qualityScore };
}
