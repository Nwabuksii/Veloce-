import { describe, it, expect } from "vitest";
import { ALL_BADGE_KEYS, MAX_PINNED_BADGES, badgeLabel, badgeTitle, globalLevelAwards, parseBadgeKey, schoolLevelAwards, type BadgeRow } from "./badges";

const T0 = new Date("2026-01-01T00:00:00Z");
const row = (id: string, finalScore: number, over: Partial<BadgeRow> = {}): BadgeRow => ({
  scribeId: id,
  universityId: "u1",
  departmentId: "d1",
  ratingPoints: 0,
  purchasePoints: finalScore,
  readPoints: 0,
  followerPoints: 0,
  growthPoints: 0,
  finalScore,
  reachedScoreAt: T0,
  ...over,
});
const keysOf = (awards: { scribeId: string; badgeKey: string }[], id: string) =>
  awards.filter((a) => a.scribeId === id).map((a) => a.badgeKey);

describe("catalogue", () => {
  it("has 40 keys that all parse, covering 25 designs", () => {
    expect(ALL_BADGE_KEYS).toHaveLength(40);
    expect(ALL_BADGE_KEYS.every((k) => parseBadgeKey(k) !== null)).toBe(true);
    // designs: category badges share one design across School/Global scope
    const designs = new Set(ALL_BADGE_KEYS.map((k) => k.replace(/_(SCHOOL|GLOBAL)(?=_\d$)/, "")));
    expect(designs.size).toBe(25);
  });
  it("rejects unknown keys", () => {
    expect(parseBadgeKey("DEPARTMENT_4")).toBeNull();
    expect(parseBadgeKey("CATEGORY_NOPE_SCHOOL_1")).toBeNull();
    expect(parseBadgeKey("whatever")).toBeNull();
  });
});

describe("titles", () => {
  it("names a badge with its scope and place", () => {
    expect(badgeTitle("CATEGORY_SELLER_SCHOOL_1")).toBe("Top Seller (School) · 1st Place");
    expect(badgeTitle("DEPARTMENT_3")).toBe("Department Leader · 3rd Place");
    expect(badgeTitle("CONSECUTIVE_DEPARTMENT")).toBe("Consecutive Department Leader");
  });
  it("allows 5 pinned badges", () => expect(MAX_PINNED_BADGES).toBe(5));
});

describe("labels", () => {
  it("formats semester, year and all-time dates", () => {
    expect(badgeLabel("SEMESTER", "26/27-S1")).toBe("26/27 · S1");
    expect(badgeLabel("YEAR", "26/27")).toBe("2026");
    expect(badgeLabel("ALL_TIME", "all", new Date("2027-03-01"))).toBe("2027");
  });
});

describe("schoolLevelAwards", () => {
  const six = ["a", "b", "c", "d", "e", "f"].map((id, i) => row(id, 60 - i * 10));

  it("gives School and Department top 3 when the department has 5+ scoring scribes", () => {
    const out = schoolLevelAwards(six);
    expect(keysOf(out, "a")).toEqual(expect.arrayContaining(["SCHOOL_1", "DEPARTMENT_1"]));
    expect(keysOf(out, "c")).toEqual(expect.arrayContaining(["SCHOOL_3", "DEPARTMENT_3"]));
    expect(keysOf(out, "d").filter((k) => /^(SCHOOL|DEPARTMENT)_/.test(k))).toEqual([]);
  });

  it("withholds Department badges below 5 scoring scribes but still gives School", () => {
    const out = schoolLevelAwards(six.slice(0, 4));
    expect(out.some((a) => a.badgeKey.startsWith("DEPARTMENT_"))).toBe(false);
    expect(keysOf(out, "a")).toContain("SCHOOL_1");
  });

  it("does not count zero-score scribes toward the 5 minimum, and never rewards a zero score", () => {
    const rows = [...six.slice(0, 4), row("z1", 0), row("z2", 0)];
    const out = schoolLevelAwards(rows);
    expect(out.some((a) => a.badgeKey.startsWith("DEPARTMENT_"))).toBe(false);
    expect(keysOf(out, "z1")).toEqual([]);
  });

  it("ranks departments separately and skips scribes with no department", () => {
    const d2 = ["p", "q", "r", "s", "t"].map((id, i) => row(id, 5 + i, { departmentId: "d2" }));
    const out = schoolLevelAwards([...six, ...d2, row("nodept", 1000, { departmentId: null })]);
    expect(keysOf(out, "t")).toContain("DEPARTMENT_1"); // best in d2, though low overall
    expect(keysOf(out, "nodept")).toContain("SCHOOL_1");
    expect(keysOf(out, "nodept").some((k) => k.startsWith("DEPARTMENT_"))).toBe(false);
  });

  it("awards category badges by that metric, top 3, only above 0", () => {
    const rows = [
      row("a", 50, { ratingPoints: 0, purchasePoints: 50 }),
      row("b", 40, { ratingPoints: 12, purchasePoints: 28 }),
      row("c", 30, { ratingPoints: 8, purchasePoints: 22 }),
      row("d", 20, { ratingPoints: 3, purchasePoints: 17 }),
    ];
    const out = schoolLevelAwards(rows);
    expect(keysOf(out, "b")).toContain("CATEGORY_RATING_SCHOOL_1");
    expect(keysOf(out, "c")).toContain("CATEGORY_RATING_SCHOOL_2");
    expect(keysOf(out, "d")).toContain("CATEGORY_RATING_SCHOOL_3");
    expect(keysOf(out, "a").some((k) => k.startsWith("CATEGORY_RATING"))).toBe(false); // 0 rating points
    expect(keysOf(out, "a")).toContain("CATEGORY_SELLER_SCHOOL_1");
    expect(out.some((a) => a.badgeKey.startsWith("CATEGORY_READ"))).toBe(false); // nobody has read points
  });
});

describe("globalLevelAwards", () => {
  it("ranks across schools and uses GLOBAL keys", () => {
    const out = globalLevelAwards([row("a", 10, { universityId: "u1" }), row("b", 90, { universityId: "u2" }), row("c", 50, { universityId: "u1" }), row("d", 5, { universityId: "u2" })]);
    expect(keysOf(out, "b")).toContain("GLOBAL_1");
    expect(keysOf(out, "c")).toContain("GLOBAL_2");
    expect(keysOf(out, "a")).toContain("GLOBAL_3");
    expect(keysOf(out, "d")).not.toContain("GLOBAL_4");
    expect(out.every((a) => !a.badgeKey.startsWith("SCHOOL_") && !a.badgeKey.startsWith("DEPARTMENT_"))).toBe(true);
    expect(keysOf(out, "b")).toContain("CATEGORY_SELLER_GLOBAL_1");
  });
});
