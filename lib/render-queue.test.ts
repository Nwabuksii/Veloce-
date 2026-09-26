import { describe, expect, it } from "vitest";
import { isRenderComplete } from "./render-queue";

describe("render completion gate", () => {
  it("tracks the last page as complete only when every cached page is present", () => {
    expect(isRenderComplete(0, 0)).toBe(true);
    expect(isRenderComplete(4, 0)).toBe(false);
    expect(isRenderComplete(4, 3)).toBe(false);
    expect(isRenderComplete(4, 4)).toBe(true);
  });
});
