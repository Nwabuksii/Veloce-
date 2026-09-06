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

module.exports = nextConfig;
