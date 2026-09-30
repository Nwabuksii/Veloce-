import { describe, expect, it } from "vitest";
import { padToMinimum } from "./timing";

describe("padToMinimum", () => {
  it("waits out the rest of the minimum", async () => {
    const started = Date.now();
    await padToMinimum(started, 60);
    expect(Date.now() - started >= 55).toBe(true);
  });
  it("does not wait when the minimum has already passed", async () => {
    const t0 = Date.now();
    await padToMinimum(t0 - 1000, 60);
    expect(Date.now() - t0 < 40).toBe(true);
  });
});
