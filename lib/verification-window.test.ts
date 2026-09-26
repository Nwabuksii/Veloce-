import { describe, expect, it } from "vitest";
import { VERIFICATION_WINDOW_MINUTES, formatVerificationWindowText } from "./verification-window";

describe("verification window copy", () => {
  it("keeps all user-facing expiry text on the 10 minute window", () => {
    expect(VERIFICATION_WINDOW_MINUTES).toBe(10);
    expect(formatVerificationWindowText(10)).toContain("10 minutes");
    expect(formatVerificationWindowText(10)).not.toContain("5 minutes");
    expect(formatVerificationWindowText(10)).not.toContain("24 hours");
  });
});
