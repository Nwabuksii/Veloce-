// Why a note is waiting in the admin review queue, in a form the moderation
// page can group and explain. Saved on the note at upload time (Note.flagDetails);
// notes flagged before that existed fall back to reading the old free-text
// flagReason (legacyDetails).

export type FlagCode = "EXACT_DUPLICATE" | "SIMILAR" | "SLIDE_SOFTWARE" | "FIRST_UPLOAD" | "LOW_TEXT" | "TOO_SHORT" | "OTHER";

export interface FlagReason {
  code: FlagCode;
  label: string; // one human sentence, shown as-is
}

/** A note this upload looks like. similarity is 0-1; exact means identical text. */
export interface FlagMatch {
  noteId: string;
  similarity: number;
  exact: boolean;
}

export interface FlagDetails {
  reasons: FlagReason[];
  matches: FlagMatch[];
}

// Most serious first. A note with several reasons is listed under the first
// of these it has (and still shows its other reasons as tags).
export const GROUP_ORDER: FlagCode[] = ["EXACT_DUPLICATE", "SIMILAR", "SLIDE_SOFTWARE", "FIRST_UPLOAD", "LOW_TEXT", "TOO_SHORT", "OTHER"];

export const GROUP_TITLES: Record<FlagCode, string> = {
  EXACT_DUPLICATE: "Identical to an existing note",
  SIMILAR: "Similar to existing notes",
  SLIDE_SOFTWARE: "Made with slide software",
  FIRST_UPLOAD: "First upload from a new scribe",
  LOW_TEXT: "Scanned or handwritten (little readable text)",
  TOO_SHORT: "Too short",
  OTHER: "Other reasons",
};

export const GROUP_HELP: Record<FlagCode, string> = {
  EXACT_DUPLICATE: "The words match another note exactly. Compare them, and check whether it is the same scribe re-uploading or someone copying.",
  SIMILAR: "A large share of the wording matches notes already on the platform. Open Compare to see which passages overlap.",
  SLIDE_SOFTWARE: "The PDF says it was made in presentation software, which is often a lecturer's slides rather than personal notes.",
  FIRST_UPLOAD: "Every new scribe's first note is checked by hand before they can sell.",
  LOW_TEXT: "Hardly any text could be read from the pages, so the automatic checks could not judge it. Read it yourself.",
  TOO_SHORT: "Fewer words than a real set of course notes usually has.",
  OTHER: "Flagged for a reason that is not one of the usual ones. See the note below.",
};

export function primaryCode(reasons: FlagReason[]): FlagCode {
  for (const code of GROUP_ORDER) {
    if (reasons.some((r) => r.code === code)) return code;
  }
  return "OTHER";
}

/** Best-effort reading of the old semicolon-joined flagReason text. */
export function legacyDetails(flagReason: string | null): FlagDetails {
  const reasons: FlagReason[] = [];
  for (const part of (flagReason ?? "").split(";").map((p) => p.trim()).filter(Boolean)) {
    const lower = part.toLowerCase();
    const code: FlagCode = lower.startsWith("first upload")
      ? "FIRST_UPLOAD"
      : lower.startsWith("too short")
        ? "TOO_SHORT"
        : lower.startsWith("near-duplicate")
          ? "SIMILAR"
          : lower.includes("presentation software")
            ? "SLIDE_SOFTWARE"
            : "OTHER";
    reasons.push({ code, label: part });
  }
  return { reasons, matches: [] };
}

/** Reads what is stored in Note.flagDetails, tolerating anything unexpected. */
export function parseFlagDetails(raw: unknown): FlagDetails | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { reasons?: unknown; matches?: unknown };
  if (!Array.isArray(obj.reasons)) return null;
  const reasons = obj.reasons.filter(
    (r): r is FlagReason => !!r && typeof (r as FlagReason).code === "string" && typeof (r as FlagReason).label === "string"
  );
  const matches = Array.isArray(obj.matches)
    ? obj.matches.filter(
        (m): m is FlagMatch => !!m && typeof (m as FlagMatch).noteId === "string" && typeof (m as FlagMatch).similarity === "number"
      )
    : [];
  return { reasons, matches };
}
