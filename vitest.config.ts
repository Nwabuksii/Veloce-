import { defineConfig } from "vitest/config";

// Deliberately minimal — these tests only cover pure functions in lib/
// (no React components, no database), so there's no jsdom environment or
// test-database setup to configure. Add those later only if a test
// actually needs them.
export default defineConfig({
  test: {
    environment: "node",
  },
});
