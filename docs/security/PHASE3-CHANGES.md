# Veloce security fixes — Phase 3 (information leakage and privacy)

Unzip `veloce-phase3.zip` over the project (on top of Phase 1, Phase 2 and the self-purchase change). **No migration, no new dependencies.**

## A · Account enumeration
**Login timing** (`auth/login`): an unknown email now runs one bcrypt comparison against a throwaway hash (made once per server instance), so "no such account" takes as long as "wrong password". Same error text as before.

**Signup** (`auth/signup`): an email that already has an account, or a signup still waiting on its link, now gets **the same 200 response as a new signup**, not a 409.
- The real owner of an existing account gets an email instead: "someone tried to sign up with your email, log in or reset your password". At most one per address per hour, so the form can't be used to fill someone's inbox.
- The password is hashed on every path, so an existing email isn't visibly faster than a new one.
- **Kept as you asked:** the "That name is already taken" message. The reserved-names message is also unchanged.
- Side effect: someone who signs up twice within 10 minutes sees "check your email" again but no second email is sent (the first link is still valid; "resend" on the login page sends another).

**Forgot-password** (`auth/forgot-password`): the response was already generic. Unknown email, cooldown and a real send now also take at least 1.5 s (`lib/timing.ts`), because a real send writes to the database and calls the email API, which used to make it noticeably slower.
- 1.5 s is a floor, not a guarantee: if the email provider is slower than that, a real send can still take longer than a fake one.

## B · Caching
- **Admin finance** (`admin/finance`) used to send `private, max-age=60, stale-while-revalidate=180`. It now sends `private, no-store, no-cache, must-revalidate`.
- **Default for everything else:** `requireRole` now adds that same header to every response that doesn't set its own. Every route behind a login is covered in one place, including all admin, scribe earnings/payout, account, messages and purchase routes. Routes that already set their own header (blocks, block notes, analytics, note pages) keep it.
- The cache classes are documented in `lib/cache-policy.ts`. There is one class today because every API route is behind a login or is a POST/webhook; there's no public cacheable API to give a second class to.

## C · Logging and Sentry
- The Paystack **dispute webhook** used to log the whole payload to the console and to Sentry (`extra: { payload }`) when it couldn't find a reference. That payload contains the customer's email and card details. It now sends only a few scalar fields (reference, status, amount, currency) and the *names* of the keys present (`lib/safe-log.ts`).
- **Sentry-wide:** `sentry.server.config.ts` and `sentry.edge.config.ts` now scrub every event before it's sent: request body, cookies and credential headers (`cookie`, `authorization`, `x-paystack-signature`, IP headers) are removed. The browser config is unchanged.
- I checked the other Sentry calls in the webhook: they only send a reference or payout id.

## D · Error messages
`scribe/upload`, `payments/initialize` and `payments/verify` returned `err.message` to the client (Prisma, Paystack and storage errors can name tables, queries and keys). They now return a plain message; the real error is still written to the server log. The upload's own limit messages (too many pages, corrupt file) are unchanged.

## E · Response audit — findings
I read every route that returns a database object. **No password hashes, reset/verification tokens, storage references or other users' private data are returned anywhere.** Specifically:
- Reset tokens are stored hashed (Phase 1) and never returned; `passwordHash` is only used server-side.
- Routes that load a full user with `include: { user: true }` (approvals, payouts, refunds) only use it internally; they return the updated row, not the user.
- Admin lists select explicit fields.
- The admin payouts list does return each scribe's **full account number** to admins, and the page shows it. I left that: an admin marking a payout paid manually needs it. It could be masked to the last 4 digits if you never pay manually.
- `payout-account` returns a scribe's own account number to them, and the page only displays the last 4. Could be trimmed the same way.
- I didn't rewrite working routes into explicit `select`s where nothing sensitive was being returned.

## Not changed on purpose
- **Locked accounts:** the "too many failed attempts" message only appears for real accounts, so it still shows that an email exists once someone has failed 5 times. Hiding it would leave a locked-out real user with a plain "wrong password" and no explanation. Tell me if you'd rather hide it.
- **Resend-verification:** "window expired" and "please wait" still differ from the generic reply. They only apply to emails that signed up in the last few minutes.
- **Payout approve (admin):** still shows the admin Paystack's reason for rejecting a transfer, since they need it.

## Not verified — please read
No `npm install`, `tsc`, database or email service here. Changed files pass a TypeScript **syntax** check, and `lib/safe-log.ts` and `lib/timing.ts` passed their tests here. The route changes have not been run. Please run `npx tsc --noEmit && npm test`, then try by hand:
1. Log in with an unknown email and with a known email + wrong password (same message; similar speed).
2. Sign up with an email that already has an account: you should see "Check your email", and the account owner should get the notice email. Repeat it: no second notice within an hour.
3. Sign up with a name that's taken: the "name already taken" message still appears.
4. Open the admin finance page and check the response headers say `no-store`.
5. Cause an upload failure and check the message no longer contains details.
