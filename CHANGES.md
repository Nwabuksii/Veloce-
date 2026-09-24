# Changed / new files in this zip

- app/components/SiteChrome.tsx — academic-profile check fails safe
  (shows the gate + logs to console) instead of silently failing open.
- app/api/auth/verify-email/route.ts — verify-email response now
  includes departmentId/level, matching the login route.
- prisma/seed.ts — REPLACES prisma/seed.js. The old seed.js used
  require() on lib/babcock-programmes.ts, which is a TypeScript file
  with `export` syntax — Node can't require() that directly, which is
  the "Cannot find module" error you hit. seed.ts uses `import`
  instead and is run through `tsx` (a TypeScript runner), which can
  load it correctly.
  -> Delete prisma/seed.js from your project, this replaces it.
- package.json — added `tsx` as a devDependency, and wired
  `prisma.seed` / `prisma:seed` to run `tsx prisma/seed.ts`.
- .gitignore — added `.next` and `tsconfig.tsbuildinfo`.

# After copying these in

1. Delete the old prisma/seed.js (this replaces it with seed.ts).
2. npm install        (pulls in tsx)
3. npm run prisma:seed
