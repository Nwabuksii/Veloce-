// Shared across the catalog filter (app/dashboard), signup, and the
// academic-profile onboarding modal — one canonical list so they can never
// drift apart.
export const LEVELS = ["100L", "200L", "300L", "400L", "500L"] as const;
export type Level = (typeof LEVELS)[number];

export function inferLevelFromCourseCode(code: string | null | undefined): Level | null {
  const match = code?.match(/\b(\d)\d{2}\b/);
  if (!match?.[1]) return null;
  const levelNumber = Number(match[1]);
  if (Number.isNaN(levelNumber)) return null;
  const levelLabel = `${levelNumber}00L` as Level;
  return LEVELS.includes(levelLabel) ? levelLabel : null;
}

export function matchesLevelFilter(
  block: { level?: string | null; courseCode?: string | null },
  selectedLevel: string | null | undefined
): boolean {
  if (!selectedLevel) return true;
  const blockLevel = block.level ?? inferLevelFromCourseCode(block.courseCode ?? null);
  return !blockLevel || blockLevel === selectedLevel;
}
