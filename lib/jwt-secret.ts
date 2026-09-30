// What counts as an acceptable JWT signing secret. Anyone who can guess this
// value can mint a login token for ANY account, admins included, so a short
// or placeholder secret is as bad as no authentication at all.
//
// Pure function on purpose (no process.env inside) so it can be unit tested;
// lib/env.ts feeds it the real value and decides what to do with the answer.

export const MIN_JWT_SECRET_LENGTH = 32;
const MIN_DISTINCT_CHARS = 10;

// Placeholder-looking values that show up in .env examples and tutorials.
// Matched as substrings, case-insensitively. All of them are long enough that
// a genuinely random 32+ character secret will not contain one by accident.
const PLACEHOLDER_FRAGMENTS = [
  "changeme",
  "change-me",
  "change_me",
  "password",
  "secret",
  "example",
  "default",
  "placeholder",
  "your-",
  "your_",
  "yoursecret",
  "replace",
  "jwtsecret",
];

/** Returns why the secret is unacceptable, or null when it is fine. */
export function jwtSecretProblem(secret: string | undefined): string | null {
  if (!secret) return "JWT_SECRET is not set.";
  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    return `JWT_SECRET is too short (${secret.length} characters; need at least ${MIN_JWT_SECRET_LENGTH}).`;
  }

  const lower = secret.toLowerCase();
  if (PLACEHOLDER_FRAGMENTS.some((fragment) => lower.includes(fragment))) {
    return "JWT_SECRET looks like a placeholder or default value.";
  }

  if (new Set(secret).size < MIN_DISTINCT_CHARS) {
    return "JWT_SECRET has too little variety (repeated characters).";
  }

  return null;
}
