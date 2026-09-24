# Changed files

- app/components/SiteChrome.tsx — academic-profile check now fails safe
  (shows the gate + logs to console) instead of silently failing open.
- app/api/auth/verify-email/route.ts — verify-email response now
  includes departmentId/level, matching the login route.
- package.json — added `prisma.seed` config + `prisma:seed` script so
  `prisma/seed.js` (which populates Department rows from
  lib/babcock-programmes.ts) actually runs. Run `npm run prisma:seed`
  once against your DB.
- .gitignore — added `.next` and `tsconfig.tsbuildinfo`.

# Deleted (stale duplicates of files under app/ — not part of this zip)

layout.tsx, page.tsx, globals.css, global-error.tsx, payment/,
privacy/, purchases/, requests/, reset-password/, scribe/, settings/,
signup/, terms/, verify-email/ (all at project root), plus
`README (1).md`, root `icon.svg`, `tsconfig.tsbuildinfo`, and the
stray `veloce/.next` build-cache folder.
