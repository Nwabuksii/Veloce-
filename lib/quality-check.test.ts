import { describe, expect, it } from "vitest";
import { jaccardSimilarity, runQualityGate, textFingerprint, MAX_TEXT_CHARS } from "./quality-check";

const words = (n: number, seed = "alpha") => Array.from({ length: n }, (_, i) => `${seed}${i}word`).join(" ");

describe("textFingerprint", () => {
  it("ignores case, punctuation and spacing", () => {
    const a = words(80);
    const b = a.toUpperCase().replace(/ /g, "  ,\n");
    expect(textFingerprint(a)).not.toBeNull();
    expect(textFingerprint(a)).toBe(textFingerprint(b));
  });
  it("differs for different text", () => {
    expect(textFingerprint(words(80, "a"))).not.toBe(textFingerprint(words(80, "b")));
  });
  it("returns null for too little text (scanned PDFs must not all collide)", () => {
    expect(textFingerprint("")).toBeNull();
    expect(textFingerprint("just a few words")).toBeNull();
  });
});

describe("runQualityGate", () => {
  it("flags an exact duplicate as 100% similar without comparing", () => {
    const r = runQualityGate(words(200), [], null, true);
    expect(r.maxSimilarity).toBe(1);
    expect(r.flagged).toBe(true);
  });
  it("still flags a near-duplicate and leaves unrelated text alone", () => {
    const base = words(200);
    expect(runQualityGate(base, [base + " extra"], null).flagged).toBe(true);
    expect(runQualityGate(base, [words(200, "zzz")], null).maxSimilarity).toBe(0);
  });
  it("keeps jaccardSimilarity behaviour", () => {
    expect(jaccardSimilarity("one two three", "one two three")).toBe(1);
  });
  it("only compares the first MAX_TEXT_CHARS of a huge text", () => {
    const huge = words(200) + " " + "x".repeat(MAX_TEXT_CHARS * 3);
    expect(() => runQualityGate(huge, [huge], null)).not.toThrow();
  });
});
