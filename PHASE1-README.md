# Phase 1 — auth and access (overlay)

Unzip over the project root (paths match `Veloce-internal/`). Overwrites 14 files, adds none. No schema change, no migration.

| # | Change | Files |
|---|---|---|
| 2 | Emails trimmed + lower-cased in login, signup, forgot-password, resend-verification, account email change | `app/api/auth/{login,signup,forgot-password,resend-verification}/route.ts`, `app/api/account/route.ts` |
| 3 | "Keep me signed in" works. Checked: 7-day persistent cookie (as before). Unchecked: browser-session cookie, 1-day token. Also carried through the 2-step (MFA) login | `lib/auth.ts`, `app/api/auth/login/route.ts`, `app/api/auth/mfa/verify/route.ts`, `app/login/page.tsx` |
| 8 | Incomplete profile (no department or level) blocks every `requireRole` API for students/scribes with 403 `{ profileIncomplete: true }`. Admins exempt. Only `GET /api/account`, `GET /api/departments`, `PATCH /api/account/academic-profile` stay open (the gate needs them) | `lib/session.ts` + those 3 routes |
| 9 | `/api/scribe/apply` (GET + POST) only for plain students who were never demoted. Scribes/admins/demoted users get `eligible:false` (GET) or 403 (POST); the page redirects them (demoted -> appeal, scribe -> /scribe, else /dashboard) | `app/api/scribe/apply/route.ts`, `app/scribe/apply/page.tsx` |
| 22 | Per-page route no longer 409s the owning scribe or a same-university admin on non-LIVE notes (same rule as all-pages) | `app/api/notes/[id]/page/[num]/route.ts` |

Known limits
- Public routes with no session (verify-email, reset-password, email-change confirm) are unchanged. The signup-verify and email-change/MFA-setup flows re-issue the cookie as a normal 7-day one, so a non-persistent session becomes persistent after those actions.
- Not type-checked or run here (no `node_modules`): please run `npm run typecheck` and `npm test`.
