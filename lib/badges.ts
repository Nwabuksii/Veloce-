import { assignRanks, type RankEntry } from "./leaderboard-rank";
import { compareScribes } from "./leaderboard-score";

// The badge catalogue and the pure awarding rules (no database — the database
// side is lib/badge-awards.ts). The approved badge sheet is the authority:
// 25 designs (3 Department + 3 School + 3 Global + 1 Consecutive Department
// + 5 categories x 3 places), shown at two scopes for the categories.
//
// badgeKey convention (stored in ScribeBadge.badgeKey):
//   DEPARTMENT_<1-3>  SCHOOL_<1-3>  GLOBAL_<1-3>  CONSECUTIVE_DEPARTMENT
//   CATEGORY_<RATING|SELLER|READ|FOLLOWED|GROWTH>_<SCHOOL|GLOBAL>_<1-3>

export const PLACES = [1, 2, 3] as const;
export type Place = (typeof PLACES)[number];
export type BadgeScope = "SCHOOL" | "GLOBAL";

export const CATEGORIES = {
  RATING: { name: "Highest Rated", points: "ratingPoints" },
  SELLER: { name: "Top Seller", points: "purchasePoints" },
  READ: { name: "Most Read", points: "readPoints" },
  FOLLOWED: { name: "Most Followed", points: "followerPoints" },
  GROWTH: { name: "Fastest Growing", points: "growthPoints" },
} as const;
export type CategoryId = keyof typeof CATEGORIES;

// A scribe can pin at most this many badges to their public profile.
export const MAX_PINNED_BADGES = 5;

// Department badges need this many active scribes with a score above 0.
export const MIN_DEPARTMENT_SCRIBES = 5;

// Every badgeKey that can exist (40: 12 placement/consecutive + 5 x 2 x 3).
export const ALL_BADGE_KEYS: string[] = [
  ...(["DEPARTMENT", "SCHOOL", "GLOBAL"] as const).flatMap((f) => PLACES.map((p) => `${f}_${p}`)),
  "CONSECUTIVE_DEPARTMENT",
  ...(Object.keys(CATEGORIES) as CategoryId[]).flatMap((c) =>
    (["SCHOOL", "GLOBAL"] as const).flatMap((s) => PLACES.map((p) => `CATEGORY_${c}_${s}_${p}`)),
  ),
];

export interface ParsedBadge {
  family: "DEPARTMENT" | "SCHOOL" | "GLOBAL" | "CONSECUTIVE_DEPARTMENT" | "CATEGORY";
  place: Place | null; // null for the consecutive badge
  category: CategoryId | null;
  scope: BadgeScope | null; // categories only
  name: string; // "Department Leader", "Top Seller", …
}

const PLACEMENT_NAMES = { DEPARTMENT: "Department Leader", SCHOOL: "School Leader", GLOBAL: "Global Leader" } as const;

export function parseBadgeKey(key: string): ParsedBadge | null {
  if (key === "CONSECUTIVE_DEPARTMENT") {
    return { family: "CONSECUTIVE_DEPARTMENT", place: null, category: null, scope: null, name: "Consecutive Department Leader" };
  }
  const parts = key.split("_");
  const place = Number(parts[parts.length - 1]) as Place;
  if (!PLACES.includes(place)) return null;
  if (parts.length === 2 && (parts[0] === "DEPARTMENT" || parts[0] === "SCHOOL" || parts[0] === "GLOBAL")) {
    return { family: parts[0], place, category: null, scope: null, name: PLACEMENT_NAMES[parts[0]] };
  }
  if (parts.length === 4 && parts[0] === "CATEGORY" && parts[1] in CATEGORIES && (parts[2] === "SCHOOL" || parts[2] === "GLOBAL")) {
    const category = parts[1] as CategoryId;
    return { family: "CATEGORY", place, category, scope: parts[2], name: CATEGORIES[category].name };
  }
  return null;
}

export const placeLabel = (place: Place) => ["1st Place", "2nd Place", "3rd Place"][place - 1];

// The date pill printed on a badge, worked out from the period (never stored):
//   SEMESTER "26/27-S1" -> "26/27 · S1"
//   YEAR "26/27"        -> "2026"   (the year the academic year starts)
//   ALL_TIME            -> the current year (all-time badges are live)
export function badgeLabel(periodType: "ALL_TIME" | "SEMESTER" | "YEAR", periodKey: string, now: Date = new Date()): string {
  if (periodType === "SEMESTER") return periodKey.replace("-", " · ");
  if (periodType === "YEAR") return String(2000 + Number(periodKey.slice(0, 2)));
  return String(now.getFullYear());
}

// ─── Awarding rules ─────────────────────────────────────────────────────

export type BadgeRow = RankEntry; // one scribe's snapshot numbers for one period
export interface Award {
  scribeId: string;
  badgeKey: string;
}

// A badge always needs a score above 0 — nobody is "Top Seller" with no sales.
const top3 = <T>(items: T[]) => items.slice(0, 3);

function categoryAwards(rows: BadgeRow[], scope: BadgeScope): Award[] {
  const out: Award[] = [];
  for (const [id, { points }] of Object.entries(CATEGORIES)) {
    const ranked = rows
      .filter((r) => r[points] > 0)
      // best in this metric first; ties fall back to the overall order
      .sort((a, b) => b[points] - a[points] || compareScribes(a, b));
    top3(ranked).forEach((r, i) => out.push({ scribeId: r.scribeId, badgeKey: `CATEGORY_${id}_${scope}_${i + 1}` }));
  }
  return out;
}

// Awards inside ONE school (pass only that school's rows): Department
// placement (only departments with >= 5 scribes scoring above 0), School
// placement and the School-scope category badges.
export function schoolLevelAwards(rows: BadgeRow[]): Award[] {
  const out: Award[] = [];
  const ranked = assignRanks(rows);

  for (const r of ranked) {
    if (r.rankSchool <= 3 && r.finalScore > 0) out.push({ scribeId: r.scribeId, badgeKey: `SCHOOL_${r.rankSchool}` });
  }

  const byDepartment = new Map<string, typeof ranked>();
  for (const r of ranked) {
    if (!r.departmentId) continue;
    byDepartment.set(r.departmentId, [...(byDepartment.get(r.departmentId) ?? []), r]);
  }
  for (const members of byDepartment.values()) {
    if (members.filter((m) => m.finalScore > 0).length < MIN_DEPARTMENT_SCRIBES) continue;
    for (const m of members) {
      if (m.rankDepartment !== null && m.rankDepartment <= 3 && m.finalScore > 0) {
        out.push({ scribeId: m.scribeId, badgeKey: `DEPARTMENT_${m.rankDepartment}` });
      }
    }
  }

  return [...out, ...categoryAwards(rows, "SCHOOL")];
}

// Awards across ALL schools (pass every school's rows). The caller only uses
// this when more than one school exists.
export function globalLevelAwards(rows: BadgeRow[]): Award[] {
  const out: Award[] = [];
  for (const r of assignRanks(rows)) {
    if (r.rankGlobal <= 3 && r.finalScore > 0) out.push({ scribeId: r.scribeId, badgeKey: `GLOBAL_${r.rankGlobal}` });
  }
  return [...out, ...categoryAwards(rows, "GLOBAL")];
}

// "Top Seller (School) · 1st Place" — used in notices and tooltips.
export function badgeTitle(key: string): string {
  const b = parseBadgeKey(key);
  if (!b) return key;
  const scope = b.scope ? ` (${b.scope === "SCHOOL" ? "School" : "Global"})` : "";
  return b.place ? `${b.name}${scope} · ${placeLabel(b.place)}` : b.name;
}
