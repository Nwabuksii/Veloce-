# Phase 10 — applicant score, queue filters, batch decisions

Drop these files over the project (same paths). No database migration, no new dependency.

| File | Change |
|---|---|
| `lib/applicant-score.ts` (new) | The 0–100 score and breakdown. School domain list and thresholds live at the top. |
| `lib/applicant-score.test.ts` (new) | Covers the table, the caps, name characters and labels. |
| `app/api/admin/scribe-applications/route.ts` | Returns score, label, breakdown and department; sorted highest first. |
| `app/api/admin/scribe-applications/bulk/route.ts` (new) | Batch approve/reject. Re-checks every score against the threshold server-side. |
| `app/admin/applications/page.tsx` | Search by name/email, course + level filters, sort by %, score and breakdown on each card, batch panel with confirm. |
| `app/purchases/page.tsx` | "Total spent" removed from My library. |
| `lib/time-ago.ts` (new) | "3 days ago" and date-time helpers. |
| `app/api/requests/route.ts` | Each request now also returns when it was made and the times of the newest 40% of voters (times only, no names). |
| `app/scribe/requests/page.tsx` | Discovery feed: "Requested 3 days ago" on every card, plus a Details button showing the first-requested time and the latest 40% of vote times. |
| `app/components/ProfileMenu.tsx` | Role shown beside the name ("Name · Admin"); admin shortcuts cut from 13 to 5 (the rest are on the Admin Dashboard). |
| `app/admin/users/page.tsx` | Details sheet: page behind it no longer scrolls; body wrapped so only one area scrolls. |
| `app/components/BlockingMessageModal.tsx`, `AcademicProfileModal.tsx`, `ConfirmDialog.tsx`, `CouponConfirmDialog.tsx` | Pop-ups can now scroll inside themselves when taller than the screen. Before, on a phone the bottom buttons could be cut off with no way to reach them. |
| `app/globals.css` | **Full file, built on the phase 9 fix version.** Replaces your current one. Changes: Manage Users details sheet, dropdown name/role, request details panel. |

Notes
- "Course" filter = the applicant's department (courses like COS 201 belong to departments; applicants only have a department and level).
- Batch actions apply only to the applications currently shown after filtering.
- Batch reject requires a message; each rejected applicant gets it as an admin message.
- Only `student.babcock.edu.ng` counts as a school email. To accept staff emails, add their domain to `SCHOOL_EMAIL_DOMAINS`.
- Refunded purchases don't count as "has bought a note".
- `purchases/page.tsx` at the zip root (outside `app/`) looks like a stray copy and was left alone.
- globals.css: if you've changed it since phase 9, copy over only the three changed blocks instead of replacing the file: `.dd-user-name*`, the `Admin > Users > "Details" modal` block, and `.request-details` / `.request-times`.
- Manage Users details on phones: the sheet was z-index 30, **under** the sticky header (100), so the header covered the top of it, including Close. It is now above the header, the Close button stays fixed while the content scrolls, and the lists stack in one column.
- "Latest 40%" = the newest 40% of the people who requested that block (rounded up), shown with their times; names stay private. The list shows at most 20 times.
