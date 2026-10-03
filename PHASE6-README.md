# Phase 6 — Data rights and Excel exports

## Install
1. `npm install exceljs`
2. Add env var `CRON_SECRET` (any long random string) on Vercel. Vercel sends it to the cron route automatically.
3. Copy the files over your project (folder paths match `app/`, `lib/`, root).

## New files
- lib/xlsx-export.ts, lib/xlsx-charts.ts — shared Excel + chart-picture helpers
- lib/export-personal.ts — "Download my data" workbook
- lib/export-finance.ts — scribe and admin finance workbooks
- app/api/account/export/route.ts — personal export (1 per hour per account)
- app/api/scribe/export/route.ts — scribe earnings/analytics export
- app/api/admin/finance/export/route.ts — admin finance export (own university only)
- app/api/cron/monthly-reports/route.ts — monthly "report is ready" email
- app/components/ExportButton.tsx

## Changed files
- app/settings/page.tsx (built on the Phase 5 version) — "Your data" panel
- app/scribe/earnings/page.tsx, app/scribe/analytics/page.tsx, app/admin/finance/page.tsx — Export button
- app/privacy/page.tsx — section 5 wording
- vercel.json — cron entry (CSP header kept)

## Notes
- Charts on the Charts sheet are pictures (the library cannot write native Excel charts); the table sheets hold the real numbers.
- The monthly email has no figures and no attachment; the report is downloaded behind login.
- The cron runs at 07:00 UTC on the 1st. `?force=1` re-runs a month on purpose.
- Not run through `next build` or tested against a database here.
