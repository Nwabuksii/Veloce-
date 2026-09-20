// Fails loudly at boot instead of letting a missing env var surface later
// as a scattered, hard-to-diagnose runtime 500 (or, worse, a silent
// security hole — see PAYSTACK_SECRET_KEY below). Called once from
// instrumentation.ts's register() hook, which Next.js runs when the
// server process starts, before any request is served.
//
// DATABASE_URL isn't listed here even though it's just as required —
// Prisma reads it directly via `env("DATABASE_URL")` in schema.prisma and
// already fails immediately and clearly on its own if it's missing, so
// there's nothing this file needs to add for that one.
const REQUIRED_ENV_VARS = [
  "JWT_SECRET",
  "PAYSTACK_SECRET_KEY",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "NEXT_PUBLIC_APP_URL",
  "BREVO_API_KEY",
  "EMAIL_SENDER_ADDRESS",
  "EMAIL_SENDER_NAME",
  "SUPPORT_EMAIL",
] as const;

export function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    // One error listing everything missing, not one throw per var — so a
    // freshly-configured deploy finds out about all of them in one shot
    // instead of fixing them one at a time across repeated failed boots.
    const message = `Missing required environment variable(s): ${missing.join(", ")}. The app cannot start safely without these — see lib/env.ts for what each one is used for.`;
    // eslint-disable-next-line no-console
    console.error(message);
    throw new Error(message);
  }
}
