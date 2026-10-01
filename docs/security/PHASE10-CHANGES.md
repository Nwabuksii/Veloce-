# Phase 10 — applicant score, queue filters, batch decisions

Drop these files over the project (same paths). No database migration, no new dependency.

| File | Change |
|---|---|
| `lib/applicant-score.ts` (new) | The 0–100 score and breakdown. School domain list and thresholds live at the top. |
| `lib/applicant-score.test.ts` (new) | Covers the table, the caps, name characters and labels. |
| `app/api/admin/scribe-applications/route.ts` | Returns score, label, breakdown and department; sorted highest first. |
| `app/api/admin/scribe-applications/bulk/route.ts` (new) | Batch approve/reject. Re-checks every score against the threshold server-side. |
| `app/admin/applications/page.tsx` | Course + level filters, sort by %, score and breakdown on each card, batch panel with confirm. |
| `app/purchases/page.tsx` | "Total spent" removed from My library. |

Notes
- "Course" filter = the applicant's department (courses like COS 201 belong to departments; applicants only have a department and level).
- Batch actions apply only to the applications currently shown after filtering.
- Batch reject requires a message; each rejected applicant gets it as an admin message.
- Only `student.babcock.edu.ng` counts as a school email. To accept staff emails, add their domain to `SCHOOL_EMAIL_DOMAINS`.
- Refunded purchases don't count as "has bought a note".
- `purchases/page.tsx` at the zip root (outside `app/`) looks like a stray copy and was left alone.
