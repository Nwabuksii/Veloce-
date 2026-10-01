# Veloce — Phase 8 (email-change confirmation + review-queue reasons)

Unzip over the project root (on top of the phases 1–7 project). One migration; `prisma/schema.prisma` is included, already merged. No new dependencies.

## 1. Changing your email now needs confirmation
Before: the email changed instantly if the new address was unused.
Now (Settings → Account, current password still required):
- Nothing changes yet. The **new** address gets "Confirm your new Veloce email" (link valid 1 hour). The email on the account only changes when that link's button is pressed.
- The **old** address gets "someone asked to change your account email" with a **"this isn't me"** link (valid 7 days). It cancels a pending change — or, if the change already went through, **puts the old email back** — signs every device out, and points to password reset.
- Confirming also signs every device out (the session carries the old email).
- Links open a page with a button; they don't act on a plain visit, so email scanners can't use them up.
- Limits: 3 email-change requests per hour per account. If the confirmation email can't be sent, nothing is saved and the person is told.
- Logged in the security history: `email_change_requested`, `email_change_confirmed`, `email_change_reverted`.
- Files: `app/api/account/route.ts`, `app/api/auth/confirm-email-change`, `app/api/auth/revert-email-change`, pages `app/confirm-email-change`, `app/email-change-not-me`, `lib/email-change.ts`, Settings message, `SiteChrome.tsx` (the two pages are full-screen).

## 2. Review queue explains why, groups notes, and lists what they match
- The queue (`/admin/moderation`) is grouped by the main reason: Identical to an existing note · Similar to existing notes · Made with slide software · First upload from a new scribe · Scanned/handwritten (little readable text) · Too short · Other. Chips at the top filter by group; each group says what it means.
- Every note shows **all** its reasons, plus the scribe's history (first note / total, live, rejected).
- For similar or identical notes it lists **every note it matches** (up to 8): course, title, scribe (or "Same scribe"), date, % similar or Identical, its status, and a **Compare** button.
- **Compare** (`/admin/moderation/compare`): two notes side by side. Text view highlights sentences that appear in both; Pages view flips through the actual pages. Shows the overall overlap and the count of identical sentences.
- New category: scanned/handwritten PDFs (few readable words across 3+ pages) are told apart from merely short ones.
- Stored on the note at upload (`Note.flagDetails`). Notes already in the queue were flagged before this existed: their reasons are read from the old text, and similar-note lists can't be rebuilt for them (the page says so).
- Files: `lib/flag-reasons.ts`, `lib/quality-check.ts` (+ tests), `app/api/scribe/upload/route.ts`, `app/api/admin/notes` (list + compare), the two moderation pages.

## Vercel
Docs now say Vercel (the code already assumed it). `netlify.toml` is unused and can be deleted.
