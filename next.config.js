/** @type {import('next').NextConfig} */
const nextConfig = {
  // @napi-rs/canvas ships a native .node binary (not JS) — without this,
  // webpack tries to parse that binary file as source code and fails with
  // "Module parse failed: Unexpected character" on every route that
  // imports lib/pdf-render.ts. This tells Next.js to require() these at
  // runtime like normal Node modules instead of bundling them.
  experimental: {
    serverComponentsExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"],
  },
};

const { withSentryConfig } = require("@sentry/nextjs");

// withSentryConfig only uploads source maps (for readable stack traces in
// Sentry) if SENTRY_AUTH_TOKEN/SENTRY_ORG/SENTRY_PROJECT are all set — with
// none of them set, the build just proceeds normally without that step.
// Nothing here breaks a build that doesn't have Sentry configured yet.
module.exports = withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
});
