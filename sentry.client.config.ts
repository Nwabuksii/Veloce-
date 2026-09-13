// Runs in the browser. If NEXT_PUBLIC_SENTRY_DSN isn't set (e.g. local dev,
// or before the founder has set up a Sentry account), Sentry's SDK
// no-ops safely — this file being present costs nothing until a real DSN
// is configured.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  // Session replay is powerful but not worth the bundle size or privacy
  // surface for a pilot at this scale — deliberately left off.
});
