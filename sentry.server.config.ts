// Runs in Next.js server code (API routes, server components). Same
// no-op-without-a-DSN behavior as sentry.client.config.ts.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
});
