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
