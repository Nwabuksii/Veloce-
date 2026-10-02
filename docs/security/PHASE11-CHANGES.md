# Phase 11 — deleted users show as "Deleted user"

Apply AFTER the latest veloce-phase10.zip. Three files here (`lib/email.ts`, `app/api/auth/signup/route.ts`, `app/admin/users/page.tsx`) are newer versions of files that are also in phase 10, so let these overwrite them.

| File | Change |
|---|---|
| `lib/deleted-user.ts` (new) | Helper: recognises a deleted account's placeholder email and shows it as "email removed". |
| `lib/email.ts` | Never tries to email a deleted account (no failed sends). |
| `app/api/auth/signup/route.ts` | "Deleted user" is a reserved name, so nobody can sign up pretending to be one. |
| `app/admin/{users,moderation,appeals,scribes,messages,payouts,reports,security}/page.tsx` | Anywhere an admin screen showed a deleted person's email, it now says "email removed". Names already show "Deleted user" because every record points to the person, not a copy of the name. |

Signing up again with a deleted person's email or name: allowed, and it creates a brand-new account (see the chat reply).
