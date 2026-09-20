# Veloce — MVP Scope & Launch Readiness

*What "done enough to let real students and scribes use this" means for Veloce, and exactly where the project stands against that bar as of this document.*

## 1. MVP definition

The MVP is: **one university, real money, real notes, safely.** Concretely, that means every one of these has to be true at once — not just "the happy path works":

1. A student can find, buy, and actually read a note, watermarked to them specifically.
2. A scribe can upload, get reviewed, and get paid what they're actually owed — no more, no less.
3. Money (revenue, refunds, credit, payouts) reconciles correctly even under retries, network failures, and concurrent requests — not just on a clean single run-through.
4. An admin at one university can never see or act on another university's data or people.
5. The obvious abuse paths (duplicate purchases, double-spent credit, cross-university moderation) are closed, not just undocumented.

## 2. Status against that bar

| Area | Status |
|---|---|
| Catalog browsing, competing-note comparison | ✅ Built |
| Purchase flow (full price + discounted) | ✅ Built |
| Watermarked in-browser reading | ✅ Built, tuned for legibility this pass |
| Scribe upload + automated quality gate + manual review | ✅ Built |
| Demand feed (request/vote/fulfill/discount) | ✅ Built, fully wired end to end |
| Scribe trust levels, public profiles, following | ✅ Built |
| Follower notification on new upload | ✅ Built this pass |
| "Haven't opened this note yet" nudge | ✅ Built this pass |
| Ratings & reviews | ✅ Built |
| Refunds → credit (platform cut untouched) | ✅ Built and corrected this pass — see `ARCHITECTURE.md` §5 |
| Admin finance dashboard accuracy | ✅ Corrected this pass |
| Scribe earnings & withdrawal → Paystack payout | ✅ Built |
| Payment resilience (webhook independent of the browser) | ✅ Built |
| Duplicate-purchase / double-spend protection | ✅ Closed this pass — see §4 |
| Cross-university admin isolation | ✅ Closed this pass (two note-moderation routes were missing the check) |
| Auth (httpOnly cookies, bcrypt, email verification gate) | ✅ Built |
| Rate limiting on auth + the most expensive route | ✅ Built |
| Env var validation at boot | ✅ Built this pass |
| Security headers | ✅ Built this pass (CSP deliberately excluded — see below) |

## 3. What's genuinely NOT done — don't launch assuming these exist

- **No Content-Security-Policy.** Every other baseline security header is in place; a CSP needs to be built against the actual running app (every real external origin enumerated and tested), not guessed from reading the code.
- **No scheduled/cron infrastructure at all.** Nothing time-based can exist yet — no digest emails, no "you haven't been back in a while," no scheduled reports. Every notification today fires off a specific action.
- **No TypeScript build verification in this environment.** The build-error bypass was turned off this pass on the reasonable assumption the codebase is clean, but that assumption has never actually been checked by running `next build`. Do this before relying on it.
- **Full visual QA hasn't happened.** The styling/color pass this session was verified structurally (design tokens, no gradients, contrast-conscious palette) but not by rendering every page in a real browser — spot-check the actual site before considering the redesign done.
- **No multi-note browsing... wait, this one's actually done** (worth calling out because an earlier internal roadmap listed it as a known gap — it's since been built: `/api/blocks/[id]/notes` lists every competing version with ratings, and the buy flow no longer silently auto-picks one).

## 4. What "duplicate purchase protection" specifically covers now

Three distinct failure modes, all closed this pass:

1. **Double-spending the same credit balance** via two concurrent requests for two different free notes (was a real, trivially-exploitable race — no payment required to trigger it).
2. **Two Paystack references for the same note** ending up both genuinely paid (a retry after a network hiccup, or two browser tabs) — now reconciled by converting the second payment into credit rather than either creating a duplicate purchase or silently keeping the buyer's money for nothing.
3. **A payment succeeding but the buyer's browser never confirming it** (closing the tab, a crash, a dead connection) — already covered by the Paystack webhook, which runs server-to-server independent of the browser; this pass confirmed it and reconciled it against fix #2 above so both paths behave identically.

## 5. Suggested launch checklist

- [ ] Run a real `npm run build` and fix whatever TypeScript errors (if any) surface now that they're no longer suppressed
- [ ] Manually click through every page on both light and dark theme after the redesign
- [ ] Build and test a Content-Security-Policy against the live app
- [ ] Confirm `PAYSTACK_SECRET_KEY` and every other required env var (see `lib/env.ts`) are set in the real production environment, not just locally
- [ ] Test the Paystack dispute webhook against a real sandbox dispute event — the payload shape was built defensively but never confirmed against a live test (see the comment in `app/api/webhooks/paystack/route.ts`)
- [ ] Decide on and communicate the refund window and discount percentage to your first cohort of scribes, since both are product policy decisions already implemented in code (`lib/pricing.ts`) but worth confirming are still what you want
