// Runs in Next.js edge runtime code (middleware, if any is ever added).
// Same no-op-without-a-DSN behavior as the other two config files.
import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "./lib/safe-log";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  // Never ship request bodies, cookies or credential headers to Sentry.
  beforeSend: scrubSentryEvent,
});
