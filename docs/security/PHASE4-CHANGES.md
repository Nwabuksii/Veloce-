# Veloce security fixes — Phase 4 (authentication, admin and financial hardening)

Unzip `veloce-phase4.zip` over the project (on top of Phases 1–3). **Two new migrations, no new dependencies.**

## ⚠ Read before deploying

1. **`lib/env.ts` never actually ran.** `ARCHITECTURE.md` says it validates env vars at boot, but nothing called it. It now runs from `instrumentation.ts` (skipped during `next build`). In production the server **refuses to start** if any variable in `REQUIRED_ENV_VARS` is missing (`DIRECT_URL`, `BREVO_API_KEY`, `EMAIL_SENDER_ADDRESS`, `EMAIL_SENDER_NAME`, `SUPPORT_EMAIL`, `NEXT_PUBLIC_APP_URL`... see the file) **or if `JWT_SECRET` is weak.** Check your Vercel environment variables first, or the deploy comes up dead.
2. **`JWT_SECRET` must be 32+ characters, not a placeholder, with real variety.** If yours isn't, generate one: `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`. Changing it signs every user out once.
3. **Two-factor is backend-only in this zip.** It is dormant: nobody can enroll until the Settings screen exists, and the login page doesn't yet understand the second step. Those two screens need your current `login/page.tsx` and `settings/page.tsx` (design/layout change — upload them first). Nothing here changes existing behaviour for anyone without MFA.

## A · JWT secret checks
**Files:** `lib/jwt-secret.ts` (new), `lib/env.ts`, `instrumentation.ts`
Rules: at least 32 characters, no placeholder words (`secret`, `password`, `changeme`, `your-`...), at least 10 distinct characters. Production: boot fails with the reason. Development: warning only.

## B · Admin two-factor login (TOTP + recovery codes)
**Files:** `lib/mfa.ts`, `lib/mfa-check.ts` (new), `app/api/auth/login`, `app/api/auth/mfa/verify` (new), `app/api/account/mfa` (new), schema + migration `20260930100000_admin_mfa`, `scripts/reset-admin-mfa.js`
- Standard authenticator-app codes (Google/Microsoft Authenticator, 1Password, Authy), built on Node's `crypto` — **no dependency**. Checked against the RFC 6238 test vectors.
- **Flow:** correct password + MFA on → login returns `{ mfaRequired: true, mfaToken }` and **no cookie**. `POST /api/auth/mfa/verify { mfaToken, code }` returns the normal login response and sets the cookie. The token lasts 5 minutes and is signed with a key derived from `JWT_SECRET`, so it can't be used as a session.
- **Guessing:** 5 tries / 15 min per account (shared with enrollment) and 30 / 15 min per network. A code can't be reused (`mfaLastStep`, claimed in one conditional update).
- **Recovery:** 10 single-use codes, shown once, stored hashed, spent with one conditional update. Either a code or a recovery code works at login.
- **Enrollment API (admins only):** `GET /api/account/mfa` (status); `POST` with `{action:"setup", currentPassword}` → `{secret, otpauthUri}`; `{action:"enable", code}` → `{recoveryCodes}`; `{action:"disable", currentPassword, code}`. Setup/disable re-ask for the password, like changing an email.
- **Enabling/disabling signs out every other device** (session version bump); the current device gets a fresh cookie.
- **The secret is stored encrypted** (AES-256-GCM) with a key from `MFA_ENCRYPTION_KEY`, else `JWT_SECRET`. If you later rotate `JWT_SECRET`, set `MFA_ENCRYPTION_KEY` to the OLD value first, or admins must re-enroll.
- **Lost phone and lost codes:** `node scripts/reset-admin-mfa.js admin@example.com` (dry run) then `--commit`. Deliberately not possible in the app.
- **No QR code** (needs a library). The screen will show the key to type in, plus the `otpauth://` link.
- **Policy call I made:** MFA is opt-in per admin, enforced once turned on. It is not forced on admins who haven't enrolled, because that could lock out your only admin. Tell me if you want it mandatory.

## C · Security-event logging
**Files:** `lib/security-log.ts` (new), plus one line in each of: login, reset-password, account (password change), promote, demote, scribe-application approve, appeal approve, ban, unban, payout request/approve/reject/mark-paid, refund approve, and every rate-limit rejection (`rateLimitResponse`).
- One JSON line per event on stdout: `{"type":"security","event":"admin_login_failed","severity":"alert",...}`. Searchable in Vercel's runtime logs.
- Only scalars are written; anything whose key looks like a credential (`password`, `token`, `secret`, `jwt`, `otp`, `recovery`, `cookie`...) is dropped by the logger itself, so a future caller can't leak one by mistake.
- `alert` events (failed admin logins, a new admin promoted, MFA disabled, failed MFA, replayed-success-after-failed payout) also go to Sentry with only the event name and user id.
- Failed logins log the **user id, not the email**, and nothing is logged for unknown emails.
- **Not built:** a database table or admin screen for events. Vercel keeps runtime logs for a limited time; if you want a permanent, searchable history in the admin area, that's a table + page (say so).

## D · Payment idempotency
**Files:** `lib/payout-settlement.ts` (new), `app/api/webhooks/paystack`, `app/api/admin/payouts/[id]/reconcile` (new), `lib/complete-purchase.ts`
- **Webhook replay bug fixed.** `transfer.success/failed/reversed` used to write the new status unconditionally. A replayed `transfer.success` re-sent the receipt email; a late `transfer.failed` overwrote a PAID payout, freeing the scribe's balance while the money had left. Now each event moves a payout only from the state it's valid for (`PROCESSING → PAID/FAILED`; `reversed` may also undo `PAID`), in one guarded update, and the receipt is sent only by the delivery that made the change. A success arriving for a payout already marked FAILED raises an alert instead of being applied.
- **Stuck `PROCESSING` payouts:** `POST /api/admin/payouts/[id]/reconcile` asks Paystack (`verifyTransfer`) and applies the answer with the same rules as the webhook. It **never** resets a payout to PENDING (no record yet ≠ no money moving). It needs a button on the admin payouts page — upload `app/admin/payouts/page.tsx` and I'll add it. Until then it can be called by hand.
- **Two references paid for the same note at once:** the in-code "already owned" check can't see a purchase committed a moment later. A database index now blocks the second purchase (section E) and `completePurchase` turns that charge into credit exactly like the existing "already owned" case, once (`ConvertedPayment.paystackRef` is unique).
- Already safe, unchanged: refund approve (guarded update), approve/reject/mark-paid (claims), payout request (row lock), verify + webhook sharing `completePurchase`.

## E · Database constraints
**Files:** migration `20260930110000_db_constraints`, `app/api/{notes,blocks,users}/[id]/report`, `purchases/[id]/refund-request`
- **CHECK constraints** (`NOT VALID`): credit balance ≥ 0, payout amount > 0, purchase/credit amounts ≥ 0, converted-payment amount ≥ 0. Enforced for new writes; existing rows aren't scanned, so this can't fail a deploy. The migration ends with commented `VALIDATE` lines to run once you've confirmed the data is clean.
- **Partial unique indexes:** one open report per reporter per note / block / user; one open refund request per purchase; one un-refunded purchase per buyer per note. Each is created only if no duplicates exist yet, otherwise skipped with a NOTICE, so the deploy can't fail on old data. The four report routes turn a violation into the same 409 as the existing check.
- After deploying, confirm which indexes exist: `SELECT indexname FROM pg_indexes WHERE indexname LIKE 'Report_open_%' OR indexname = 'Purchase_active_buyer_note_key';` (5 rows expected).
- **Already in the schema** (nothing to add): one review per purchase, one follow per pair, one vote per request and per poll.
- **Not added:** a "one payout per scribe per month" constraint. The rule is by calendar month, not expressible as a plain index; the existing row-lock transaction enforces it.
- ⚠ **Prisma drift:** Prisma can't represent these indexes/constraints in `schema.prisma`. I believe `prisma migrate dev` ignores them, but I couldn't run it here. After applying, run `npx prisma migrate dev` once locally and confirm it proposes **no** new migration. If it wants to drop them, tell me before you accept anything (you've hit drift before).

## Not verified — please read
No `npm install`, `tsc`, database or Paystack here. All 32 changed TypeScript files pass a syntax check. The TOTP code was run against the RFC 6238 vectors and the secret rules were run against sample secrets. **Not run:** vitest, full type-check, any route, the migrations against Postgres.
Run `npx prisma generate && npx tsc --noEmit && npm test`, then by hand:
1. Boot with a short `JWT_SECRET` in production mode: it must refuse to start.
2. Payout webhook: send the same `transfer.success` twice — one receipt email, status stays PAID; then send `transfer.failed` — still PAID.
3. Buy the same note from two tabs at once — the second payment becomes credit.
4. File the same report twice at once — one 409.
5. (After the screens exist) enroll, log out, log in with a code, and with a recovery code.

## Not done in this phase
- Login and Settings screens for two-factor, and the "Check with Paystack" button (both need your current page files).
- Central "resource belongs to my university" helper — not in your Phase 4 list, so I didn't start it.
- Making MFA mandatory for admins (see policy call above).
