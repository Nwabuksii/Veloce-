// Sentry's own recommended pattern for Next.js App Router (v8+): server and
// edge Sentry.init() calls need to run through this register() hook rather
// than being picked up automatically from sentry.server.config.ts /
// sentry.edge.config.ts sitting at the project root. Those two files still
// hold the actual init logic — this just tells Next.js when to load each
// one, based on which runtime is currently starting up.
export async function register() {
  // Runs once when the server process starts, before any request is
  // served — the one place a missing env var can be caught as a loud
  // boot-time failure instead of a scattered runtime 500 later. Only
  // meaningful in the nodejs runtime (the edge runtime doesn't run any of
  // the code that reads these vars).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("./lib/env");
    validateEnv();
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
