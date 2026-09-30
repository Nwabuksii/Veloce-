import * as Sentry from "@sentry/nextjs";

// One place for security-relevant events (failed admin logins, role changes,
// password resets, payouts, refunds...) so they can be searched in the
// hosting provider's function logs under a single shape:
//
//   {"type":"security","event":"admin_login_failed","severity":"alert","userId":"...","ts":"..."}
//
// Rules this file enforces so no caller can get them wrong:
//   - only plain scalars are logged (no objects, so no request bodies or
//     full payment payloads sneak in),
//   - anything whose key looks like a credential is dropped,
//   - logging can never throw or fail the request it is describing.
// Events with severity "alert" are also sent to Sentry, with only the event
// name and user id attached. Every event is also saved to the database
// (lib/security-store.ts) for the admin security history page.

export type SecuritySeverity = "info" | "warn" | "alert";

export type SecurityEvent =
  | "login_failed"
  | "login_locked"
  | "admin_login_failed"
  | "mfa_failed"
  | "mfa_recovery_code_used"
  | "mfa_enabled"
  | "mfa_disabled"
  | "password_reset_completed"
  | "password_changed"
  | "role_changed"
  | "user_banned"
  | "user_unbanned"
  | "payout_requested"
  | "payout_approved"
  | "payout_rejected"
  | "payout_marked_paid"
  | "payout_settled"
  | "payout_reconciled"
  | "refund_approved"
  | "rate_limited"
  | "webhook_replay_ignored";

type Scalar = string | number | boolean;
export type SecurityFields = Record<string, Scalar | null | undefined>;

// Keys that must never be logged, whatever a caller passes.
const SECRET_KEY_PATTERN = /pass(word)?|token|secret|jwt|cookie|authorization|otp|totp|recovery|card|pin$/i;
const MAX_STRING_LENGTH = 200;

/** Keeps only safe scalar fields; exported for tests. */
export function sanitizeFields(fields: SecurityFields = {}): Record<string, Scalar> {
  const clean: Record<string, Scalar> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) continue;
    if (SECRET_KEY_PATTERN.test(key)) continue;
    if (typeof value === "string") clean[key] = value.slice(0, MAX_STRING_LENGTH);
    else if (typeof value === "number" || typeof value === "boolean") clean[key] = value;
  }
  return clean;
}

/** First address in x-forwarded-for, the same one ipKeyFrom uses for rate limits. */
export function requestIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function logSecurityEvent(
  event: SecurityEvent,
  fields: SecurityFields = {},
  severity: SecuritySeverity = "info"
): Promise<void> {
  try {
    const clean = sanitizeFields(fields);
    const line = JSON.stringify({ type: "security", event, severity, ...clean, ts: new Date().toISOString() });
    if (severity === "info") console.info(line);
    else console.warn(line);

    if (severity === "alert") {
      Sentry.captureMessage(`Security: ${event}`, {
        level: "warning",
        tags: { securityEvent: event },
        extra: typeof clean.userId === "string" ? { userId: clean.userId } : undefined,
      });
    }

    // Permanent copy for /admin/security. Awaited (callers await this) so the
    // write finishes before a serverless function is frozen; loaded lazily so
    // the pure helpers above stay importable without a database.
    const { persistSecurityEvent } = await import("@/lib/security-store");
    await persistSecurityEvent({ event, severity, ...clean });
  } catch {
    // Logging must never break the request it is describing.
  }
}
