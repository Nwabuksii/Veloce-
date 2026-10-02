import { CATEGORIES, PLACES, MIN_DEPARTMENT_SCRIBES, parseBadgeKey, type CategoryId, type Place } from "./badges";

// Plain-language "how do I earn this?" text for the badges page. Pure (no
// database); the rules themselves live in lib/badges.ts and lib/badge-awards.ts.

export interface BadgeGuide {
  title: string; // "Department Leader · 1st Place"
  summary: string; // one line
  how: string[]; // what you have to do
  when: string; // when it is handed out
  label: string; // what the date on the badge means
}

const ORDINAL: Record<Place, string> = { 1: "1st", 2: "2nd", 3: "3rd" };

const METRIC: Record<CategoryId, { what: string; counts: string }> = {
  RATING: {
    what: "rating points",
    counts: "Rating points come from verified buyer reviews. A note needs at least 3 reviews to count, and only an average above 4.0 earns points.",
  },
  SELLER: {
    what: "purchase points",
    counts: "Purchase points come from how many different students bought your notes, added up note by note, so many good notes beat one viral note. Refunded and disputed purchases do not count.",
  },
  READ: {
    what: "notes-read points",
    counts: "Notes-read points come from buyers who actually opened the notes they bought.",
  },
  FOLLOWED: {
    what: "follower points",
    counts: "Follower points come from verified, active students who follow you.",
  },
  GROWTH: {
    what: "growth points",
    counts: "Growth points come from new buyers on your notes and new uploads over the last 30 days.",
  },
};

const ELIGIBLE = "You need at least one live note, and you must not be banned, demoted or graduated.";
const OVERALL = "Overall score combines ratings, purchases, notes read, growth and followers.";

export function badgeGuide(key: string): BadgeGuide | null {
  const b = parseBadgeKey(key);
  if (!b) return null;
  const nth = b.place ? ORDINAL[b.place] : "";

  if (b.family === "DEPARTMENT") {
    return {
      title: `${b.name} · ${nth} Place`,
      summary: `Finish ${nth} in your department.`,
      how: [
        `Rank ${nth} on your department's overall leaderboard when the semester ends. ${OVERALL}`,
        `Your department needs at least ${MIN_DEPARTMENT_SCRIBES} scribes with a score above 0.`,
        ELIGIBLE,
      ],
      when: "Handed out automatically when the admin starts the next semester.",
      label: "The semester it was earned in, for example 26/27 · S1. It is yours for good.",
    };
  }
  if (b.family === "SCHOOL") {
    return {
      title: `${b.name} · ${nth} Place`,
      summary: `Finish ${nth} in your whole school.`,
      how: [`Rank ${nth} on your school's overall leaderboard when the semester ends. ${OVERALL}`, ELIGIBLE],
      when: "Handed out automatically when the admin starts the next semester.",
      label: "The semester it was earned in, for example 26/27 · S1. It is yours for good.",
    };
  }
  if (b.family === "GLOBAL") {
    return {
      title: `${b.name} · ${nth} Place`,
      summary: `Finish ${nth} across all schools.`,
      how: [
        `Rank ${nth} across every school on Veloce for the academic year. ${OVERALL}`,
        "Only exists once more than one school is on Veloce.",
        ELIGIBLE,
      ],
      when: "Handed out when the academic year ends, after every school has closed its second semester.",
      label: "The year, for example 2026. It is yours for good.",
    };
  }
  if (b.family === "CONSECUTIVE_DEPARTMENT") {
    return {
      title: b.name,
      summary: "Be your department's 1st place in both semesters of one academic year.",
      how: [
        "Earn Department Leader · 1st Place in semester 1 and again in semester 2 of the same academic year.",
        "It only counts inside one academic year, and there is no 3x version.",
      ],
      when: "Handed out automatically when semester 2 closes.",
      label: "The year and semester 2, for example 26/27 · S2. It is yours for good.",
    };
  }

  const m = METRIC[b.category as CategoryId];
  return {
    title: `${b.name} · ${nth} Place`,
    summary: `Be number ${b.place} for ${m.what}.`,
    how: [
      m.counts,
      `Be in the top 3 for ${m.what} in your school when a semester ends, or across all schools when the academic year ends.`,
      "You need a score above 0 in this category.",
      "It is not ranked per department.",
    ],
    when: "Handed out automatically at the end of a semester (school) or academic year (all schools). Also kept live: while you hold a top 3 spot in the all-time ranking, the badge shows with the current year, and it goes if you drop out of the top 3.",
    label: "The semester (school) or the year (all schools).",
  };
}

// What the catalogue shows, in the order of the approved badge sheet.
// `sample` is the badge key used to draw the shield; `datePill` stands in for
// the date, which only exists once the badge is earned.
export interface CatalogueGroup {
  title: string;
  blurb: string;
  designs: { name: string; datePill: string; keys: string[] }[];
}

const placed = (family: string) => PLACES.map((p) => `${family}_${p}`);

export const BADGE_CATALOGUE: CatalogueGroup[] = [
  {
    title: "Leader badges",
    blurb: "For finishing in the top 3 of the overall ranking.",
    designs: [
      { name: "Department Leader", datePill: "Semester", keys: placed("DEPARTMENT") },
      { name: "School Leader", datePill: "Semester", keys: placed("SCHOOL") },
      { name: "Global Leader", datePill: "Year", keys: placed("GLOBAL") },
      { name: "Consecutive Department Leader", datePill: "Semester 2", keys: ["CONSECUTIVE_DEPARTMENT"] },
    ],
  },
  {
    title: "Category badges",
    blurb: "For being top 3 at one thing, in your school or across all schools.",
    designs: (Object.keys(CATEGORIES) as CategoryId[]).map((c) => ({
      name: CATEGORIES[c].name,
      datePill: "Semester / Year",
      keys: PLACES.map((p) => `CATEGORY_${c}_SCHOOL_${p}`),
    })),
  },
];
