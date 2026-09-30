import { describe, expect, it } from "vitest";
import { sanitizeFields } from "./security-log";

describe("sanitizeFields", () => {
  it("keeps scalars and drops null/undefined", () => {
    expect(sanitizeFields({ userId: "u1", amount: 5000, ok: true, gone: null, missing: undefined })).toEqual({
      userId: "u1",
      amount: 5000,
      ok: true,
    });
  });
  it("drops anything that looks like a credential", () => {
    const out = sanitizeFields({
      password: "x",
      newPassword: "x",
      resetToken: "x",
      jwt: "x",
      mfaSecret: "x",
      recoveryCode: "x",
      otp: "123456",
      cookie: "x",
      authorization: "Bearer x",
      reference: "veloce-payout-1",
    });
    expect(out).toEqual({ reference: "veloce-payout-1" });
  });
  it("truncates long strings", () => {
    expect((sanitizeFields({ note: "a".repeat(500) }).note as string).length).toBe(200);
  });
});
