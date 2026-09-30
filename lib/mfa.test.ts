import { beforeAll, describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  normalizeRecoveryCode,
  signMfaChallenge,
  totpCodeAt,
  totpStep,
  verifyMfaChallenge,
  verifyTotp,
} from "./mfa";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-with-plenty-of-length-0123456789abcdef";
});

// RFC 6238 appendix B (SHA-1, secret "12345678901234567890"), last 6 digits.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));
const RFC_VECTORS: [number, string][] = [
  [59, "287082"],
  [1111111109, "081804"],
  [1111111111, "050471"],
  [1234567890, "005924"],
  [2000000000, "279037"],
];

describe("base32", () => {
  it("round-trips", () => {
    const bytes = Buffer.from("hello veloce");
    expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
  });
  it("matches the RFC 4648 example", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
  });
});

describe("totp", () => {
  it("matches the RFC 6238 test vectors", () => {
    for (const [seconds, expected] of RFC_VECTORS) {
      expect(totpCodeAt(RFC_SECRET, totpStep(seconds * 1000))).toBe(expected);
    }
  });
  it("accepts the current code and one step of drift, rejects further", () => {
    const now = 1234567890 * 1000;
    const step = totpStep(now);
    expect(verifyTotp(RFC_SECRET, totpCodeAt(RFC_SECRET, step), { nowMs: now })).toBe(step);
    expect(verifyTotp(RFC_SECRET, totpCodeAt(RFC_SECRET, step - 1), { nowMs: now })).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, totpCodeAt(RFC_SECRET, step + 2), { nowMs: now })).toBeNull();
  });
  it("refuses a code from a step that was already used", () => {
    const now = 1234567890 * 1000;
    const step = totpStep(now);
    const code = totpCodeAt(RFC_SECRET, step);
    expect(verifyTotp(RFC_SECRET, code, { nowMs: now, lastUsedStep: step })).toBeNull();
    expect(verifyTotp(RFC_SECRET, code, { nowMs: now, lastUsedStep: step - 1 })).toBe(step);
  });
  it("rejects malformed input", () => {
    expect(verifyTotp(RFC_SECRET, "12345")).toBeNull();
    expect(verifyTotp(RFC_SECRET, "abcdef")).toBeNull();
  });
  it("ignores spaces in the code", () => {
    const now = 1234567890 * 1000;
    const code = totpCodeAt(RFC_SECRET, totpStep(now));
    expect(verifyTotp(RFC_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, { nowMs: now })).not.toBeNull();
  });
});

describe("secret storage", () => {
  it("round-trips and is not plaintext", () => {
    const secret = generateTotpSecret();
    const stored = encryptSecret(secret);
    expect(stored).not.toContain(secret);
    expect(decryptSecret(stored)).toBe(secret);
  });
  it("detects tampering", () => {
    const stored = encryptSecret("ABCDEFGH");
    const tampered = stored.slice(0, -2) + (stored.endsWith("AA") ? "BB" : "AA");
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

describe("recovery codes", () => {
  it("generates the requested number of distinct, well-formed codes", () => {
    const codes = generateRecoveryCodes(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  });
  it("hashes the same however the code is typed", () => {
    expect(hashRecoveryCode("abcde-fghjk")).toBe(hashRecoveryCode("ABCDE FGHJK"));
    expect(normalizeRecoveryCode("abcde-fghjk")).toBe("ABCDEFGHJK");
  });
});

describe("login challenge", () => {
  it("round-trips a user id", () => {
    expect(verifyMfaChallenge(signMfaChallenge("user-1"))).toBe("user-1");
  });
  it("rejects garbage", () => {
    expect(verifyMfaChallenge("not-a-token")).toBeNull();
  });
  it("is not a valid session token", async () => {
    const { verifyToken } = await import("./auth");
    expect(verifyToken(signMfaChallenge("user-1"))).toBeNull();
  });
});
