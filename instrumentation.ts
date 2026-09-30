// Sentry's own recommended pattern for Next.js App Router (v8+): server and
// edge Sentry.init() calls need to run through this register() hook rather
// than being picked up automatically from sentry.server.config.ts /
// sentry.edge.config.ts sitting at the project root. Those two files still
// hold the actual init logic — this just tells Next.js when to load each
// one, based on which runtime is currently starting up.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // lib/env.ts was written to run here but was never actually called, so
    // its checks (missing variables, weak JWT secret) never ran. Skipped
    // during `next build`, which has no production secrets to check.
    if (process.env.NEXT_PHASE !== "phase-production-build") {
      const { validateEnv } = await import("./lib/env");
      validateEnv();
    }
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
