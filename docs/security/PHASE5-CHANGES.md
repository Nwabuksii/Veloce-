# Veloce — Phase 5 (two-step screens + security history)

- **Two-step screens:** `app/login/page.tsx` gets the code step (with recovery-code option); `app/settings/page.tsx` Account tab gets the admin-only Two-step verification panel.
- **Security history `/admin/security`:** new `SecurityEvent` table; filters by person, event, severity and date range; loads more on scroll; same-university only. Rate-limit events stay in the logs only. Linked from the admin hub and profile menu.
- **How events get there:** `logSecurityEvent` (lib/security-log.ts) now also saves each event through `lib/security-store.ts`. It is async and every call site awaits it, so the write finishes before a serverless function is frozen.
- **Monthly clear:** when a month ends, its events are emailed to `EMAIL_SENDER_ADDRESS` as a CSV (`lib/security-archive.ts`), then deleted. If the email fails nothing is deleted. It triggers itself the first time an admin opens the page or an event is recorded in the new month.
- **Payouts:** "Check with Paystack" button on processing payouts, shown only when `PAYOUTS_AUTOMATED` is true.
