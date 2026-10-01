import { describe, expect, it } from "vitest";
import { scoreApplicant, labelFor, type ScoreInput } from "./applicant-score";

const now = new Date("2026-10-01T00:00:00Z");
const base: ScoreInput = {
  email: "adebello@student.babcock.edu.ng",
  emailVerifiedAt: new Date("2026-09-30T00:00:00Z"),
  fullName: "Ade Bello",
  avatarUrl: "https://x/y.png",
  createdAt: new Date("2026-09-29T00:00:00Z"), // 2 days old
  purchases: 0,
  feedback: 0,
  follows: 0,
};

describe("scoreApplicant", () => {
  it("scores a verified, matching, clean, photo, no-activity applicant at 60", () => {
    expect(scoreApplicant(base, now).score).toBe(60);
  });

  it("drops the no-activity penalty once they have bought and reviewed", () => {
    expect(scoreApplicant({ ...base, purchases: 1, feedback: 1 }, now).score).toBe(90);
  });

  it("caps activity at 30 so the maximum is 100", () => {
    const full = { ...base, purchases: 3, feedback: 2, follows: 4, createdAt: new Date("2026-01-01") };
    expect(scoreApplicant(full, now).score).toBe(100);
  });

  it("gives an unverified school email +10 instead of +40", () => {
    expect(scoreApplicant({ ...base, emailVerifiedAt: null }, now).score).toBe(30);
  });

  it("caps non-school emails at 30 whatever else they did", () => {
    const r = scoreApplicant({ ...base, email: "adebello@gmail.com", purchases: 2, feedback: 2, follows: 2 }, now);
    expect(r.score).toBe(30);
  });

  it("allows hyphens, apostrophes and spaces but not symbols or digits", () => {
    const clean = (n: string) => scoreApplicant({ ...base, fullName: n }, now).lines.some((l) => l.label === "Clean name");
    expect(clean("Ade-Bello")).toBe(true);
    expect(clean("Chidi O'Brien")).toBe(true);
    expect(clean("Ade_Bello")).toBe(false);
    expect(clean("Ade2")).toBe(false);
    expect(clean("Ade 😀")).toBe(false);
  });

  it("gives +7 when only the initials match the email", () => {
    const r = scoreApplicant({ ...base, email: "ab2201@student.babcock.edu.ng" }, now);
    expect(r.lines.find((l) => l.label.startsWith("Email matches"))?.points).toBe(7);
  });

  it("never goes below 0 and its breakdown adds up to the score", () => {
    const r = scoreApplicant({ ...base, email: "x@gmail.com", fullName: "$$$", avatarUrl: null }, now);
    expect(r.score).toBe(0);
    expect(r.lines.reduce((s, l) => s + l.points, 0)).toBe(0);
  });
});

describe("labelFor", () => {
  it("uses 70 and 40 as the boundaries", () => {
    expect(labelFor(70)).toBe("strong");
    expect(labelFor(69)).toBe("review");
    expect(labelFor(40)).toBe("review");
    expect(labelFor(39)).toBe("weak");
  });
});
