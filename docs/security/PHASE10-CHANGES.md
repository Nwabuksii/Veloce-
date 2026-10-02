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
| `lib/email.ts` | Fails with a clear message if `BREVO_API_KEY` / `EMAIL_SENDER_ADDRESS` are missing, times out after 10 s, and includes Brevo's status in the error. |
| `app/api/auth/signup/route.ts` | If the email can't be sent, no longer says "check your email": the pending row is removed and the person is told to try again. Signing up again with a pending email now re-sends the same link (once a minute). Broken-link guard if `NEXT_PUBLIC_APP_URL` is unset. |
| `app/api/auth/resend-verification/route.ts` | Re-sends the **same** link instead of making a new token (the old way killed the link in the first email). One resend a minute per address. |
| `app/api/auth/verify-email/route.ts` | Clearer message when a link is unknown or already used. |
| `app/signup/page.tsx` | "Resend verification email" button on the check-your-email screen. |
| `scripts/delete-user.js` (new) | Testing-only "delete user, keep their records" tool. See below. |
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

## Email delivery findings (signup)
1. **Dead-end resend:** the signup screen said "go to login to resend it", but a new signup has no account yet, so login answers "Invalid email or password" and the resend button never appears. Fixed with the button on the signup screen.
2. **Silent send failure:** if Brevo failed (bad key, unverified sender, daily limit, timeout) the person still saw "Check your email". Fixed.
3. **Repeat signup sent nothing:** signing up again with a pending email said "check your email" but sent no email. Fixed.
4. **Resend killed the first link:** fixed (same token).
5. **Not fixable in code, check in Brevo:** Transactional > Logs (delivered / soft bounce / blocked), the sender is verified, the sending domain has SPF/DKIM/DMARC set up (a Gmail/Yahoo sender address will often land in spam or be rejected by school mail), and the free plan's 300 emails/day limit.
6. **Worth deciding:** the link lives only 10 minutes and school mail servers can delay messages. Opening the link verifies immediately, so an email security scanner that opens links can use it up before the student does. A "Confirm my email" button on the page would prevent that. Not changed.

## Deleting a test user (records stay)
```
ALLOW_USER_DELETE=true node scripts/delete-user.js student@example.com            # dry run: shows what stays
ALLOW_USER_DELETE=true node scripts/delete-user.js student@example.com --commit    # does it
```
- The person becomes "Deleted user": name, email, photo, bank details, password, two-factor and sessions are removed, and the email can be used to sign up again.
- Purchases, reviews, feedback, votes, follows and messages stay, so every scribe count, earning and ledger total is unchanged.
- Admin accounts and already-deleted accounts are refused. Without `ALLOW_USER_DELETE=true` it does nothing: don't set it once you launch.
- Prisma Studio will still refuse to delete a user who has purchases. That is intentional.
