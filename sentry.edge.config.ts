// Runs in Next.js edge runtime code (middleware, if any is ever added).
// Same no-op-without-a-DSN behavior as the other two config files.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
});
