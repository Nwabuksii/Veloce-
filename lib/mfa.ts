import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import jwt from "jsonwebtoken";

// Time-based one-time passwords (RFC 6238) and single-use recovery codes for
// admin two-factor login, built on Node's own crypto — no extra dependency.
// Compatible with Google Authenticator, Microsoft Authenticator, 1Password,
// Authy, etc. (SHA-1, 6 digits, 30-second steps — the defaults every one of
// them assumes).

const STEP_SECONDS = 30;
const DIGITS = 6;
// A code from the previous or next 30-second step is also accepted, to
// absorb clock drift between the phone and the server.
const ALLOWED_DRIFT_STEPS = 1;

// ── Base32 (RFC 4648, no padding) — the format authenticator apps expect ──

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of text.toUpperCase().replace(/=+$/, "")) {
    const index = B32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error("Invalid base32 character");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// ── TOTP ──────────────────────────────────────────────────

/** A fresh 160-bit secret, base32-encoded (what gets typed into the app). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function hotp(key: Buffer, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary =
    ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

export function totpStep(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000 / STEP_SECONDS);
}

export function totpCodeAt(secret: string, step: number): string {
  return hotp(base32Decode(secret), step);
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Returns the time step the code belongs to, or null when it is wrong.
 * `lastUsedStep` is the most recent step already accepted for this user: a
 * code from that step or earlier is refused, so a code that was shoulder-
 * surfed or intercepted can't be replayed inside its 30-second window.
 */
export function verifyTotp(
  secret: string,
  code: string,
  options: { nowMs?: number; lastUsedStep?: number | null } = {}
): number | null {
  const cleaned = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return null;

  const current = totpStep(options.nowMs);
  const lastUsed = options.lastUsedStep ?? -1;
  let matched: number | null = null;

  // Checks every candidate step (no early exit) so timing doesn't reveal
  // which one matched.
  for (let step = current - ALLOWED_DRIFT_STEPS; step <= current + ALLOWED_DRIFT_STEPS; step++) {
    if (safeEqual(totpCodeAt(secret, step), cleaned) && step > lastUsed) matched = step;
  }
  return matched;
}

export function otpauthUri(secret: string, accountEmail: string, issuer = "Veloce"): string {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

// ── Secret storage ────────────────────────────────────────
// The TOTP secret is stored encrypted (AES-256-GCM), so a copy of the
// database alone can't generate anyone's codes. The key comes from
// MFA_ENCRYPTION_KEY when set, otherwise from JWT_SECRET. Note the
// consequence: if you rotate JWT_SECRET without setting MFA_ENCRYPTION_KEY
// to the OLD value first, stored secrets can no longer be decrypted and
// admins must re-enroll (scripts/reset-admin-mfa.js clears them).

function encryptionKey(): Buffer {
  const material = process.env.MFA_ENCRYPTION_KEY || process.env.JWT_SECRET || "";
  return createHash("sha256").update(`veloce-mfa-secret:${material}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function decryptSecret(stored: string): string {
  const [version, iv, tag, data] = stored.split(":");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unrecognised MFA secret format");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

// ── Recovery codes ────────────────────────────────────────
// Ten single-use codes shown once at enrollment, stored only as hashes.
// 10 characters from a 31-letter alphabet is ~50 bits of randomness, which
// is why a plain SHA-256 (rather than bcrypt) is enough here.

const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I, O, 0, 1
export const RECOVERY_CODE_COUNT = 10;

export function generateRecoveryCodes(count: number = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const chars = Array.from({ length: 10 }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]).join("");
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

/** Case, spaces and the dash are ignored when a code is typed back in. */
export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(`veloce-recovery:${normalizeRecoveryCode(code)}`).digest("hex");
}

export function looksLikeRecoveryCode(code: string): boolean {
  return normalizeRecoveryCode(code).length === 10;
}

// ── Login challenge ───────────────────────────────────────
// After the password is accepted for an admin with MFA on, the browser gets
// this short-lived token instead of a session cookie, and trades it plus a
// code for the real session (POST /api/auth/mfa/verify).
//
// Signed with a key DERIVED from JWT_SECRET, not JWT_SECRET itself. That is
// what stops it being accepted as a session: verifyToken (lib/auth.ts) uses
// the raw secret, so a challenge token fails its signature check there.

const CHALLENGE_TTL_SECONDS = 5 * 60;

function challengeKey(): string {
  return createHmac("sha256", process.env.JWT_SECRET || "").update("veloce-mfa-challenge").digest("hex");
}

export function signMfaChallenge(userId: string): string {
  return jwt.sign({ sub: userId, purpose: "mfa-challenge" }, challengeKey(), { expiresIn: CHALLENGE_TTL_SECONDS });
}

/** The user id the challenge was issued for, or null if invalid/expired. */
export function verifyMfaChallenge(token: string): string | null {
  try {
    const payload = jwt.verify(token, challengeKey()) as { sub?: string; purpose?: string };
    return payload.purpose === "mfa-challenge" && typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
