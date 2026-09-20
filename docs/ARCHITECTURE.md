# Veloce — Architecture

*How the system is actually built, as of this document. Written so a new developer (or another AI agent) can get oriented without re-deriving everything from the source.*

## 1. Stack

- **Framework**: Next.js 14 (App Router), TypeScript, React 18 — one codebase for frontend and backend, API routes under `app/api/`.
- **Database**: Postgres (Neon), via Prisma ORM. `prisma/schema.prisma` is the single source of truth for the data model.
- **Auth**: bcrypt password hashing + JWT, held in an **httpOnly cookie** (not `localStorage` — see §6). A separate, non-sensitive `StoredUser` (name, role, avatar) is cached client-side in `localStorage` purely for instant UI rendering; it is never the source of truth for access control.
- **Payments**: Paystack. Checkout is a redirect flow (`initialize` → Paystack-hosted page → `callback` → `verify`), backed by a signed webhook as the resilient, browser-independent confirmation path.
- **File storage**: Cloudinary (both the original PDFs and the rendered page-image cache).
- **PDF rendering**: `pdfjs-dist` + `@napi-rs/canvas`, rendered server-side per page, on demand, cached as an image after first render.
- **Deployment target**: Netlify (`netlify.toml`, `@netlify/plugin-nextjs`). `npm run build` runs `prisma migrate deploy && prisma generate && next build` — migrations apply automatically on every deploy.
- **Error monitoring**: Sentry, wired through `instrumentation.ts` (see §7).

## 2. Data model (high level)

```
University → Department → Course → Block → Note (many-to-one: several scribes can compete on one Block)
User (STUDENT | SCRIBE | ADMIN, role hierarchy: ADMIN > SCRIBE > STUDENT)
Purchase (buyer × note, the ledger of every sale, refund, and credit redemption)
Review (one per Purchase)
BlockRequest + RequestVote (the demand feed)
Follow (student → scribe, independent of having purchased anything)
Payout (scribe withdrawals, batched separately from individual purchases)
AdminMessage (the in-app notification system — every "you got notified" feature in the product is a row here)
```

Every content-bearing table is reachable from `University` by foreign key, so a second university is data-isolated by construction — not by a `WHERE` clause someone has to remember to add. **This isolation still has to be explicitly checked in every route that takes an `[id]` param** — see §8 for two places that check was missing until this pass.

## 3. Roles & access control

`lib/session.ts`'s `requireRole()` wraps route handlers. The role hierarchy (Admin > Scribe > Student) means `requireRole("STUDENT")` also admits scribes and admins — a higher role always inherits lower-tier access. A role change takes effect on the user's **next login** (fresh JWT), not immediately.

`lib/note-access.ts`'s `checkNoteAccess()` is the one gate for "can this user see this note's content": the note's own scribe, any admin, or a non-refunded purchaser. It's the same check used by the watermarking route (§4) and nowhere is note content served through any other path.

## 4. Watermarking & PDF pipeline

Every page of every note is served through **one route**: `GET /api/notes/[id]/page/[num]`. There is no other way to fetch note content — no raw-file route exists.

1. `checkNoteAccess()` gates the request.
2. The first time a given page is requested, it's rendered from the source PDF (`pdfjs-dist` + `@napi-rs/canvas`) and the *unwatermarked* base image is cached (Cloudinary) — this is the expensive step, done once per page ever.
3. **Every single response**, cache hit or not, has the viewer's name, email, and the current date stamped onto it fresh, tiled across the page, before being returned. This happens unconditionally — there's no code path that returns an unstamped image to an authenticated viewer.
4. The response is sent with `Cache-Control: private, no-store, no-cache, must-revalidate` — it must never be cached by a browser, proxy, or CDN, since it's unique per viewer.

Because step 2's cache is storage-backend-agnostic (it's just bytes fetched by URL, watermarked fresh regardless of where they came from), switching the storage backend (this project moved from Vercel Blob to Cloudinary) does not affect whether watermarking happens — it's structurally impossible to bypass without also bypassing `checkNoteAccess()`.

The same route also marks `Purchase.firstOpenedAt` the first time the *buyer specifically* (never an admin or the owning scribe previewing their own note) loads a page — this powers the "you haven't started reading this yet" nudge and nothing else.

## 5. Money: pricing, refunds, and credit

This is the subsystem most worth understanding precisely, because it's the one place where getting the mental model slightly wrong silently loses (or fabricates) money. Full detail lives in `lib/pricing.ts` and `lib/complete-purchase.ts`; this is the summary.

**Two price tiers**, both fixed:
- **Standard**: full block price, split 60% scribe / 40% platform.
- **Discounted (request-fulfilled)**: a fixed, lower total, still split so the scribe's cut is unchanged — only the platform's share is reduced. This is a thank-you to the students who voted for a request, not a general discount.

**Refunds never touch the platform's own cut.** When an admin refunds a purchase, only the *scribe's* cut is reversed (pulled out of their earnings) — the platform's share of that original sale stays banked, permanently, whether or not the purchase is ever refunded. The buyer is given spendable credit equal to what they paid (not equal to just the reclaimed scribe cut) — that credit's *face value* is what determines how much top-up cash a future purchase needs, even though only the scribe-cut portion of it ever actually moves to a new scribe.

**Spending credit**: when credit covers a purchase (fully or partly), the scribe who gets paid receives a **fixed** cut — never a price-or-discount-based one — because that money is a reassignment of a cut already reclaimed from an earlier refund, not new revenue. The platform's cut on that transaction is **100% of whatever fresh cash** the buyer pays on top of their credit (zero if credit covers it fully) — never a proportional split of that top-up.

**A genuine chargeback (dispute) is not a refund.** Paystack disputes arrive via webhook, are handled completely separately from the admin-refund flow, pull the sale out of every revenue calculation (both scribe and platform — real money actually left via the bank), and deliberately never grant the buyer credit, since that's a goodwill gesture for a refund the platform chose to give, not for money clawed back involuntarily.

**Admin finance dashboard**: platform revenue and the scribe payout pool are each computed **per transaction row**, never as one aggregate minus another — that subtraction approach was the actual bug fixed this session (an admin-approved refund was incorrectly zeroing out the platform's own untouched revenue from that sale, because the whole row was being excluded rather than just the scribe's reversed portion).

**Duplicate-purchase / double-spend protection** (see `lib/complete-purchase.ts`, shared by both the browser-driven `verify` route and the Paystack webhook):
- Credit balance decrements are guarded (conditional `updateMany`, not a blind decrement) so two concurrent requests can't both spend the same credit.
- If a buyer ends up with two separately-paid-for references for the same note (a retry after a network hiccup, two tabs), the second payment is converted to credit rather than creating a duplicate purchase or silently keeping the money.
- A payment that succeeds with Paystack but never gets confirmed by the buyer's browser (closed tab, crash, dead connection) is still completed via the webhook, independent of the browser entirely.

## 6. Security posture

- **Auth**: JWT in an httpOnly cookie, `sameSite: lax`. Login is blocked entirely for unverified email addresses.
- **Rate limiting**: DB-backed (`lib/rate-limit.ts`), applied to every auth endpoint, refund requests, feedback, and the page-image route (the single most CPU-expensive route in the app).
- **Webhook signature verification**: HMAC-SHA512, compared with `crypto.timingSafeEqual` (constant-time, to close a timing-attack surface on the webhook secret).
- **Env var validation**: `lib/env.ts`, run once at server boot via `instrumentation.ts` — a missing required var (JWT secret, Paystack key, Cloudinary keys, etc.) now fails loudly at startup instead of surfacing as a scattered runtime 500 later.
- **Security headers**: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS, all set in `next.config.js`. **No Content-Security-Policy yet** — deliberately, since a correct one requires enumerating and testing every real external origin the app loads from, not guessing from source.
- **University isolation**: every admin route that takes an `[id]` param is expected to verify the target resource belongs to the admin's own university. Two routes (`admin/notes/[id]/approve` and `reject`) were missing this check and could act cross-university; fixed this pass.
- **File uploads**: size-capped (3MB), page-capped (300 pages), PDF-magic-byte validated, and a scribe's very first upload always goes to manual review regardless of what the automated quality gate finds.

## 7. What does NOT exist (real constraints, not just unbuilt features)

- **No scheduled/cron jobs anywhere in this project.** Every notification fires synchronously off a specific action (a purchase, a refund, a new upload). Anything time-based — a digest email, a "come back" reminder days later — would need new infrastructure (e.g. a Netlify scheduled function), not just a new route.
- **No Content-Security-Policy** (see §6).
- **TypeScript build errors are no longer suppressed** (`ignoreBuildErrors` was turned off this pass) **but this has not been verified against a real `next build`** in this environment — there was no network access available to install dependencies and actually run one.

## 8. Notable fixes made across this project's build history

Kept here as a record of *why* certain code looks the way it does, for whoever reads it next:

- The credit-redemption scribe payout used to scale with the new note's price instead of being fixed — meant a refund's reclaimed value could buy a more expensive note than was ever paid for.
- The admin finance dashboard used to exclude a refunded purchase's row entirely, which zeroed out the platform's own untouched revenue from that sale, not just the reversed scribe cut.
- A race condition let the same credit balance be spent twice via concurrent requests, with no payment required.
- Two admin note-moderation routes (`approve`, `reject`) were missing the cross-university ownership check every sibling admin route had.
- The Paystack webhook signature check used a non-constant-time string comparison.
