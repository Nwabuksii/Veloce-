import { describe, expect, it } from "vitest";
import { matchesLevelFilter, inferLevelFromCourseCode } from "./academic";

describe("matchesLevelFilter", () => {
  it("shows a block only when the block level matches the requested level", () => {
    expect(matchesLevelFilter({ level: "100L", courseCode: "COS 201" }, "100L")).toBe(true);
    expect(matchesLevelFilter({ level: "100L", courseCode: "COS 201" }, "200L")).toBe(false);
    expect(matchesLevelFilter({ level: "200L", courseCode: "COS 201" }, "200L")).toBe(true);
  });

  it("falls back to course code when the block has no explicit level recorded", () => {
    expect(matchesLevelFilter({ level: null, courseCode: "COS 201" }, "200L")).toBe(true);
    expect(matchesLevelFilter({ level: null, courseCode: "COS 201" }, "100L")).toBe(false);
  });
});

describe("inferLevelFromCourseCode", () => {
  it("reads the academic level from a course code like COS 201", () => {
    expect(inferLevelFromCourseCode("COS 201")).toBe("200L");
    expect(inferLevelFromCourseCode("GST 111")).toBe("100L");
    expect(inferLevelFromCourseCode("MTH 400")).toBe("400L");
  });
});
