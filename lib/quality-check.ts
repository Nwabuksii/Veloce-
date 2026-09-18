// Lightweight automated quality gate — no external AI call needed to start.
// - Completeness: flags uploads that look too short to be real course notes.
// - Similarity: flags likely-duplicate uploads within the same block, using
//   Jaccard similarity over word sets (cheap, no embeddings/API required).
// - PDF origin: flags a PDF whose own metadata says it was produced by
//   slide/presentation software rather than typed or scanned personal
//   notes — a real signal (a lecturer's own slide deck, or a downloaded
//   deck, carries this in its Producer/Creator fields) but an imperfect
//   one (a scribe COULD legitimately type notes into Keynote/PowerPoint),
//   which is exactly why this only flags for human review rather than
//   auto-rejecting.
// This can be swapped for a real AI pass later without touching callers —
// runQualityGate's signature stays the same either way.

const MIN_WORD_COUNT = 150;
const SIMILARITY_FLAG_THRESHOLD = 0.75;

// Matched case-insensitively against the PDF's Producer/Creator metadata.
// Deliberately narrow (named presentation/slide tools only) — broad terms
// like "Adobe" would also catch ordinary scanning apps and false-flag
// every legitimate photographed/scanned upload.
const SLIDE_TOOL_SIGNATURES = [/powerpoint/i, /keynote/i, /impress/i, /canva/i, /google slides/i];

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
  reasons: string[]; // human-readable, shown as-is in the moderation queue
}

export function runQualityGate(
  newText: string,
  existingTexts: string[],
  pdfInfo?: { Producer?: string; Creator?: string } | null
): QualityResult {
  const wc = wordCount(newText);
  const maxSimilarity = existingTexts.reduce((max, t) => Math.max(max, jaccardSimilarity(newText, t)), 0);
  const qualityScore = Math.min(wc / 500, 1);

  const reasons: string[] = [];
  if (wc < MIN_WORD_COUNT) reasons.push(`Too short (${wc} words, minimum ${MIN_WORD_COUNT})`);
  if (maxSimilarity > SIMILARITY_FLAG_THRESHOLD) {
    reasons.push(`Near-duplicate of an existing note (${Math.round(maxSimilarity * 100)}% similar)`);
  }
  const producerOrCreator = `${pdfInfo?.Producer ?? ""} ${pdfInfo?.Creator ?? ""}`;
  const matchedTool = SLIDE_TOOL_SIGNATURES.find((sig) => sig.test(producerOrCreator));
  if (matchedTool) {
    reasons.push(`PDF metadata suggests presentation software, not personal notes ("${producerOrCreator.trim()}")`);
  }

  return { wordCount: wc, maxSimilarity, flagged: reasons.length > 0, qualityScore, reasons };
}
