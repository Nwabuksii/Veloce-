import { describe, expect, it } from "vitest";
import { mapLimit, withTimeout } from "./async-limits";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("mapLimit", () => {
  it("never runs more than the limit at once and keeps input order", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await sleep(5);
      running--;
      return n * 2;
    });
    expect(peak).toBe(3);
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
  });

  it("stops starting new items after a failure", async () => {
    const started: number[] = [];
    await expect(
      mapLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
        started.push(n);
        await sleep(5);
        if (n === 2) throw new Error("boom");
        return n;
      })
    ).rejects.toThrow("boom");
    await sleep(30);
    expect(started.length).toBeLessThan(6);
  });

  it("handles an empty list", async () => {
    expect(await mapLimit([], 3, async (n) => n)).toEqual([]);
  });
});

describe("withTimeout", () => {
  it("passes the result through when fast enough", async () => {
    expect(await withTimeout(Promise.resolve("ok"), 50, "x")).toBe("ok");
  });
  it("rejects when too slow", async () => {
    await expect(withTimeout(sleep(100), 10, "Slow thing")).rejects.toThrow("Slow thing timed out");
  });
});
