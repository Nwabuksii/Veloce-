/** @type {import('next').NextConfig} */
const nextConfig = {
  // Previously `ignoreBuildErrors: true` — that let real TypeScript
  // errors ship straight to production instead of failing the build.
  // IMPORTANT: this repo hasn't been run through an actual `next build`
  // in this environment (no network access here to install dependencies
  // or execute one), so this flip is unverified — if there are existing
  // type errors anywhere in the codebase, your next build will now fail
  // on them instead of silently deploying broken code. Run `npm run
  // build` locally before you push this, and fix whatever it surfaces.
  typescript: {
    ignoreBuildErrors: false,
  },

  // Baseline hardening that's safe to turn on blind — none of these can
  // break functionality the way a Content-Security-Policy guess could.
  // A CSP is deliberately NOT included here: doing it properly means
  // enumerating every external origin this app actually loads from
  // (Cloudinary images, Paystack's checkout redirect, Sentry, any fonts/
  // scripts), and getting it wrong silently breaks things like checkout
  // or image loading. That needs to be built and tested against the
  // running app, not guessed from reading the code — worth doing as a
  // deliberate follow-up, not bundled into this pass.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Stops this site from being iframed elsewhere (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
          // Stops the browser from guessing a file's type from its
          // content and executing it as something other than what its
          // Content-Type says (relevant given users can upload files).
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Sends the full referrer to your own origin, only the bare
          // origin (no path/query) to anywhere else — avoids leaking
          // e.g. a password-reset token that ended up in a URL.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // This app doesn't need any of these browser capabilities —
          // explicitly disables them so an XSS bug couldn't invoke them.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Tells browsers to only ever reach this origin over HTTPS for
          // the next year, including subdomains — only safe to send once
          // you're certain everything is served over HTTPS in production,
          // which Netlify/Vercel-style hosting gives you by default.
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },

  // @napi-rs/canvas ships a native .node binary (not JS) — without this,
  // webpack tries to parse that binary file as source code and fails with
  // "Module parse failed: Unexpected character" on every route that
  // imports lib/pdf-render.ts. This tells Next.js to require() these at
  // runtime like normal Node modules instead of bundling them.
  experimental: {
    serverComponentsExternalPackages: ["@napi-rs/canvas", "pdfjs-dist"],

    // Because pdfjs-dist is external (line above), Vercel's build-time
    // file tracer (@vercel/nft) decides what from node_modules actually
    // ships with each serverless function. pdf.js loads its worker file
    // (pdf.worker.mjs) via a path it constructs internally at runtime —
    // not a static `import` — so the tracer can't see that dependency
    // and leaves it out. The function then 404s on that file the moment
    // pdfjs tries to load it ("Cannot find module
    // '.../pdf.worker.mjs'"), on every single PDF regardless of content.
    // This explicitly forces it into the bundle for every route that
    // touches lib/pdf-render.ts.
    outputFileTracingIncludes: {
      "/*": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
    },
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
});
