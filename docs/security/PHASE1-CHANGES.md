# Veloce security fixes — Phase 1

Ten fixes. Each has its own zip (only the files that fix touches, at their real paths) and everything is also in `veloce-phase1-ALL.zip`. **Easiest: unzip `veloce-phase1-ALL.zip` over the project.** If you apply the per-fix zips instead, apply them in numeric order: `login/route.ts` appears in 01 and 10, and 10 contains the final version with both changes.

No new dependencies. Everything reuses `requireRole`, `checkRateLimit`, Prisma `updateMany`, and the existing `@upstash/redis` client.

---

## 01 · Stale roles / session revocation
**Files:** `prisma/schema.prisma`, migration `20260929120000_session_version`, `lib/auth.ts`, `lib/session.ts`, `login`, `verify-email`, `demote`, `ban`, `account` routes

- **Old:** A scribe demoted to student keeps a JWT that says `SCRIBE` for up to 7 days, so they can keep uploading and withdrawing. A banned user's token still works again the moment the ban lapses.
- **New:** `requireRole` reads the user's current role and `sessionVersion` from the database on every request (it already did a DB write there, so this is the same query). The handler gets the *database* role, not the token's. Demoting or banning bumps `sessionVersion`, so old tokens are rejected with 401 "session expired". A banned user still sees the ban message first.
- **Not logged out by the deploy:** tokens issued before this release have no version and are treated as version 0, which is what every user starts at.

## 02 · Password reset kills sessions + hashed reset tokens
**Files:** `reset-password`, `forgot-password` routes

- **Old:** Attacker steals a session cookie. Victim resets their password. The attacker's cookie keeps working. Reset tokens sit in the database in plaintext, so anyone reading the table gets working reset links.
- **New:** A reset bumps `sessionVersion`, so every existing session dies. Only the SHA-256 of the token is stored; the raw token exists only in the email. The token is spent with one conditional update, so two simultaneous uses of one link can't both succeed. Also covers password changes from Settings (in 01): other devices are signed out, the current device gets a fresh cookie.
- **Side effect:** reset links issued before the deploy stop working (1-hour lifetime). Users just request a new one.

## 03 · Atomic payout request
**Files:** `app/api/scribe/payouts/route.ts`

- **Old:** Scribe has ₦10,000. They fire 5 parallel requests for ₦10,000. Each checks the balance (all see ₦10,000), then each creates a payout. Five payouts, ₦50,000 requested.
- **New:** The window check, balance check and insert run in one transaction that first locks that scribe's user row (`SELECT … FOR UPDATE`). The second request waits, then sees the first payout and gets "more than your available balance". Other scribes are unaffected.

## 04 · Duplicate Paystack transfer / approve-vs-reject race
**Files:** `lib/paystack.ts`, `approve`, `reject`, `mark-paid` payout routes

- **Old:** Admin A clicks Approve while Admin B clicks Reject. Both read `PENDING`. Approve sends the money via Paystack, then Reject writes `FAILED`, which frees the balance, so the scribe withdraws the same money again. Separately, any error in approve (even a network timeout after Paystack accepted the transfer) marked the payout `FAILED`.
- **New:** Approve, reject and mark-paid each *claim* the payout with `updateMany({ where: { id, status: "PENDING" } })`; only the caller that gets `count === 1` proceeds, the other gets a 409 and Paystack is never contacted. The transfer reference is saved at claim time so the webhook can always find it. `FAILED` is set only when Paystack explicitly rejects (a 4xx). A timeout/5xx leaves the payout `PROCESSING` and tells the admin to check Paystack under that reference; the `transfer.success`/`failed` webhook settles it. If the failure happens *before* any transfer (recipient setup), the payout goes back to `PENDING` so it can be retried.

## 05 · `payments/verify` ownership
**Files:** `app/api/payments/verify/route.ts`

- **Old:** Any logged-in student who knows or guesses another buyer's Paystack reference gets that buyer's purchase record back.
- **New:** The lookup is `{ paystackRef, buyerId: you }`. Someone else's reference finds nothing, falls through to the Paystack check, and fails the existing metadata-owner comparison with no sign that the reference exists.

## 06 · Private note storage
**Files:** `lib/storage.ts`, `scripts/migrate-note-files-to-private.js`, `app/api/admin/users/[id]/route.ts`

- **Old:** PDFs and the un-watermarked page renders are uploaded `access_mode: public`, and the raw URL is stored in the database. Anyone with a URL (leaked, or shared by a buyer) downloads the note with no watermark and no purchase.
- **New:** New uploads are Cloudinary `authenticated`: the plain URL returns 403. The database stores an internal reference (`cld-private:raw:notes/<id>.pdf`), and the server turns it into a signed URL for a single fetch that is never sent to a browser. The admin user-detail endpoint no longer returns the file field. Existing files keep working (the reader accepts both formats) until you run the migration script.
- **You must do:** deploy first, then `node scripts/migrate-note-files-to-private.js` (dry run), then `--commit`. Per file it re-uploads as private, verifies the copy is readable and the same size, switches the DB row, then deletes the public copy. Safe to re-run.
- ⚠ **Untested against Cloudinary** (no network here). Before running the migration on real data, upload one note on staging and read it back.

## 07 · Ban check + status check on note viewing
**Files:** the three `app/api/notes/[id]/…` routes

- **Old:** These routes only verified the token signature, so a banned user (or a demoted/deleted one) could keep reading every note they'd bought. `all-pages` also had no status check, so a removed or flagged note could still be pulled by a past buyer.
- **New:** They use `requireRole`, so ban, session-version and DB-role checks apply like everywhere else. Buyers can pull `all-pages` only while the note is `LIVE`; the owning scribe and same-university admins are exempt, because the moderation page uses that route to review flagged notes.

## 08 · Blocking-message deletion bypass
**Files:** `lib/blocking-messages.ts` (new), `messages/[id]`, `messages/blocking`

- **Old:** A serious message or required poll blocks the app until acknowledged. The user just calls `DELETE /api/messages/[id]` and it disappears without being acknowledged or voted on.
- **New:** Delete returns 409 while the message is still blocking. "Blocking" is defined once and shared by the gate endpoint and the delete endpoint, so they can't drift.

## 09 · University isolation gaps
**Files:** scribe `profile`, `follow`, `blocks` (GET), and `requests` (POST) routes

- **Old:** A student at university B who knows a course id can create requests against a university A course, list its blocks, or view/follow scribes there.
- **New:** All four return the same 404 as a nonexistent id, so ids can't be probed across universities.
- **Policy call I made:** strictly same-university. Your notes said cross-university browsing might become deliberate (`catalogScope`). There is one university today, so nothing changes now. When you add a second, loosen these four checks per `catalogScope`.

## 10 · Login rate-limit race
**Files:** `lib/rate-limit.ts`, `login` route

- **Old:** The limiter read the counter, added one, and wrote it back, so 50 parallel requests all read "0" and all pass. The failed-login counter did the same, so parallel wrong passwords undercounted and dodged the 5-strike lockout.
- **New:** Redis: one atomic `INCR` + `PEXPIRE` Lua script (no window where a crash leaves a counter with no expiry). Dev/no-Redis fallback: one atomic SQL `INSERT … ON CONFLICT`. Failed logins use `failedLoginAttempts: { increment: 1 }` and read the returned value. New Redis key prefix (`rl2`) so old JSON-valued keys can't clash; they expire on their own.

---

## Deploy order
1. Deploy the ALL zip. The build runs `prisma migrate deploy` (adds `User.sessionVersion`) and `prisma generate`.
2. Run the storage migration script (fix 06), dry run first.

## Not verified — please read
- I could not run `npm install`, `tsc`, tests or a database here (no network). Every changed file passes a TypeScript **syntax** check and I verified the key type patterns in isolation, but **full type-check, tests and a real run have not happened**. Run `npx prisma generate && npx tsc --noEmit && npm test` first.
- Worth testing by hand: payout double-submit, approve-then-reject, demote-then-request, reset-password-then-old-cookie, and one Cloudinary upload/read.

## Deliberately left for later phases
- Logout does **not** bump the session version (it would sign the user out of all devices). Tell me if you want that.
- A payout stuck `PROCESSING` after an unknown Paystack outcome has no automatic reconciliation yet (Phase 4, financial idempotency).
- Deleting an already-voted poll still deletes its votes.
- The zip contains stray duplicate copies of some pages at the project root (`/page.tsx`, `/scribe/…`) and a `veloce/.next` folder. I changed only `app/` and `lib/`.
