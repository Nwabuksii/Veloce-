# Veloce — Phase 6 (admin two-step reminder)

Unzip `veloce-phase6.zip` over the project (on top of Phase 5). No migration, no new dependencies. Two-step stays optional — nothing is blocked.

- A red bar at the very top of the screen tells an admin their account is protected by a password only, with a link straight to Settings → Account (`/settings?tab=account`) and an X to hide it.
- Only shows while the admin is in **admin mode** (the "view as" switch) and two-step is **off**. Turning it on in Settings makes it disappear on the next page.
- The X hides it until the next login; every login brings it back (`lib/mfa-reminder.ts`, reset in `app/login/page.tsx`).
- `app/settings/page.tsx` now opens the tab named in `?tab=`.
- `app/components/SiteChrome.tsx` renders the bar above the header. It is not on login/signup screens.

Note: `login/page.tsx` and `settings/page.tsx` here include the Phase 5 changes, so apply this zip after Phase 5.
