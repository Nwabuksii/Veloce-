# Veloce — Project State & Roadmap (v3)

*Academic notes marketplace, piloting at Babcock University. This document is written so any developer or AI agent can pick up this project without needing to ask clarifying questions — it captures every decision made, what's built, what's not, and exactly what's next.*

---

## 1. Product decisions (final, all confirmed by the founder)

- **Pricing**: ₦1,000 flat per block. Split: **60% scribe / 40% platform**. This split is tracked internally but **never shown to scribes in the UI** — they only see performance metrics (sales count, ratings), not money.
- **Roles**: Student (default) → Scribe (apply, admin-approved) → Admin. Role hierarchy: Admin > Scribe > Student — higher roles inherit lower-tier access. A role change only takes effect on the user's **next login** (fresh JWT).
- **Multi-university from day one**: schema scopes everything under University → Department → Course → Block, even though only Babcock is live. Students never see another university's data.
- **Courses and blocks are scribe-authored, not fixed**: scribes can pick an existing course/block or create a brand new one with any name/title they want. This was a deliberate change from an earlier fixed-catalog approach.
- **Every block needs at least 3 topics** (short outline items, e.g. "Recursion", "Backtracking") at creation time, extensible beyond 3. Shown to students on the catalog before they buy.
- **Multiple scribes can compete on the same block** — each upload is its own `Note` row; students choose based on ratings. There is currently no student-facing UI to browse *between* competing notes on the same block (the purchase flow auto-picks the first `LIVE` note) — this is a known gap, see §4.
- **Purchases are permanent**, tied to the buyer's account, no expiry/subscription. Each block paid for separately.
- **Ratings**: 1-5 stars + optional comment, only from users who actually purchased (enforced via `Purchase` → `Review` link, one review per purchase).
- **Demand feed** (the "request a block" system): students request content that doesn't exist yet; requests auto-group by course + similar wording into one card with a live vote/demand count (TikTok-style discovery feed, not a manual assignment system). Multiple scribes can compete to fulfill the same request. Students who requested a block that gets fulfilled should get a **10-15% discount** on it — *not yet wired up, see §4*.
- **Scribe reputation (not yet built)**: scribes should have public profiles showing total ratings, paid-subscriber count (people who bought from them), follower count (people who just follow, not necessarily bought), and a "trust level." See §4.
- **Future feature**: a search bar with filters for school/department/course, across the whole catalog. Not yet built.
- **Auth**: email/password only (no OAuth). JWT-based sessions, currently stored in `localStorage` client-side (flagged as a pre-launch security improvement — should move to httpOnly cookies before going live).
- **File storage**: uploaded PDFs currently save to local disk (`storage/notes/`), served only through an authenticated route that checks the requester purchased/owns/administers the note. **This does not work on serverless hosting** (e.g. Vercel) — must swap for real object storage (S3, Vercel Blob, Cloudinary) before deploying live.

---

## 2. Tech stack

- **Frontend/backend**: Next.js 14 (App Router), TypeScript, React 18
- **Database**: Neon (serverless Postgres) via Prisma ORM
- **Auth**: bcrypt password hashing + JWT (jsonwebtoken), custom `requireRole()` middleware wrapping route handlers
- **Payments**: Paystack (test mode confirmed working end-to-end: initialize → redirect → verify → unlock)
- **PDF text extraction**: `pdf-parse`
- **Styling**: plain CSS (no framework), design based on a founder-supplied static HTML mockup — clean SaaS look, rounded cards, blue accent (`#2a7de1`), dark navy primary buttons (`#0b1e33`)
- **Icons**: Font Awesome via CDN (`cdnjs.cloudflare.com`) — **known fragility**: if this CDN is blocked by the user's network, icons AND surrounding button content can fail to render cleanly. Self-hosting the icon font is a good hardening step before launch.
- **Dev environment**: founder is on Windows, VS Code, Node.js v24 (newer than typically recommended — Node 20 LTS suggested as a fallback if odd install issues recur)

The founder is **not a developer** — every terminal command, file placement, and concept has been explained step by step throughout this build. Keep instructions concrete and avoid assuming prior knowledge of npm/git/etc. Prefer building real UI over asking the founder to use Postman/curl wherever feasible.

### Delivery convention
Code has been delivered as a full project zip after each feature (not individual files) — the founder extracts it and copies the contents into their existing project folder, replacing files when prompted. `.env`, `node_modules`, and `prisma/migrations` are never included in these zips.

---

## 3. What's built and confirmed working (as of this document)

| Area | Status |
|---|---|
| Database schema (Prisma) | ✅ Full schema: University → Department → Course → Block → Topic/Note, Users, ScribeApplication, Purchase, Review, Payout, BlockRequest/RequestVote |
| Auth (signup/login) | ✅ Working, tested |
| RBAC middleware | ✅ `requireRole()` in `lib/session.ts`, supports both static and dynamic (`[id]`) routes |
| Student catalog | ✅ Real block browsing with topics shown, tied to live DB data |
| Paystack checkout | ✅ Full loop confirmed: initialize → redirect → real test-card payment → verify → block unlocks |
| Scribe application → admin approval | ✅ Real UI both sides (dashboard button → admin panel with approve/reject) |
| Scribe upload flow | ✅ Scribes create/choose their own course + block (with ≥3 topics) and upload a PDF |
| Automated quality gate | ✅ Lightweight, no external AI call: word-count completeness check + Jaccard text-similarity duplicate detection against other notes in the same block. Flags → admin moderation queue; passes → goes live immediately |
| Admin moderation queue | ✅ Real UI: preview PDF, approve/reject flagged uploads |
| File access control | ✅ PDFs served only via `/api/notes/[id]/file`, gated to owner/admin/purchaser |
| Scribe workspace | ✅ Real dashboard: uploads, status, sales count, ratings — **no earnings shown**, per founder's explicit request |
| Ratings & reviews | ✅ Students can rate/comment on purchases via `/purchases`; feeds into scribe workspace ratings |
| Demand feed (requests) | ✅ Just built this session: students post/vote on requests (auto-grouped by course + wording), scribes see a ranked discovery feed at `/scribe/requests`. **Fulfillment linkage and the discount are not yet wired up — see §4, this is the very next thing to build.** |

---

## 4. What's NOT built yet — prioritized next steps

1. **Wire up request fulfillment + discount** (immediate next step, demand feed is only half-done):
   - When a scribe creates a new block, let them optionally select an open `BlockRequest` for that course to fulfill. On creation: set `BlockRequest.blockId` and `status = "FULFILLED"`.
   - When uploading a `Note` for that block, set `Note.fulfillsRequestId`.
   - In `/api/payments/initialize`, check if the buyer has a `RequestVote` on the request that this note fulfills; if so, apply a 10-15% discount to `amountPaid` (pick a fixed percentage — 10% is a safe default — and confirm with founder if they want it configurable).
   - `Purchase.discountApplied` field already exists in the schema for this — just needs to actually get set.

2. **Scribe public profile pages**: clickable from anywhere a scribe's name appears (block cards, reviews). Should show: full name, total ratings/average, **paid-subscriber count** (distinct buyers across all their notes), **follower count** (a NEW concept — students can follow a scribe without buying; needs a new `Follow` model: `followerId` + `scribeId`, unique pair), and a **"trust level"** (not yet defined — likely a computed tier based on sales volume + average rating + moderation history; needs founder input on exact thresholds/tiers before building).

3. **Search bar + filters** (school/department/course) across the catalog. School filtering is currently moot (only Babcock exists) but should be built to scale once a second university launches.

4. **Multi-note browsing UI**: right now, when a block has 2+ competing scribe uploads, the purchase flow silently picks the first `LIVE` one. Students should be able to see all competing notes for a block, compare ratings, and choose which to buy. This is a real gap versus the "competing uploads" design and should be prioritized alongside the profile work.

5. **Pre-launch hardening** (not urgent while testing locally, but required before going live):
   - Move JWT from `localStorage` to httpOnly cookies (XSS risk)
   - Swap local file storage for real object storage (won't survive serverless deploy)
   - Self-host Font Awesome instead of CDN (reliability)
   - Real Paystack **webhook** in addition to (or instead of) the current verify-on-callback approach, for reliability if a user closes the tab before the callback fires

---

## 5. Known caveats / things to keep in mind

- The founder had a prior, unrelated database schema in their Neon instance (tables like `admin_messages`, `bank_accounts`, `follows`, `topics`) from an earlier prototype attempt — this was wiped via `prisma migrate dev`'s reset prompt early in this build, confirmed fine to lose (test data only).
- Seed script (`prisma/seed.js`) creates a placeholder "Sample Scribe" user and one sample course/blocks — useful for testing, not real data. Safe to ignore/delete once real scribes are onboarding.
- No email verification, password reset, or account recovery flow exists yet — signup/login only.
- No notification system exists — e.g., a requester doesn't get notified when their request is fulfilled (this was part of the original design intent but hasn't come up as a priority yet).

---

## 6. How to resume work

The founder will hand you a zip of the current project state, or you're working directly in their `veloce` folder. Read `prisma/schema.prisma` first — it's the single source of truth for what data model decisions have already been made. Cross-reference against §3/§4 above before proposing changes, and check with the founder before altering anything already marked "confirmed working" in §1.
