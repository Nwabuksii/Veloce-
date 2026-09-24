import { describe, expect, it } from "vitest";
import { isUserOnline } from "./online";

describe("isUserOnline", () => {
  it("returns true when the user was active within the recent activity window", () => {
    const recent = new Date(Date.now() - 60 * 1000);
    expect(isUserOnline(recent, 5)).toBe(true);
  });

  it("returns false when the user has been inactive beyond the window", () => {
    const stale = new Date(Date.now() - 10 * 60 * 1000);
    expect(isUserOnline(stale, 5)).toBe(false);
  });

  it("returns false when lastSeenAt is missing", () => {
    expect(isUserOnline(null, 5)).toBe(false);
  });
});
