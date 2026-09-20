# Veloce — Product Requirements Document

*Academic notes marketplace, piloting at Babcock University. This document reflects the product as it currently stands, not the original scaffold plan — see `ARCHITECTURE.md` for how it's built and `MVP.md` for launch scope.*

## 1. Problem

Students at a given university repeatedly need the same course notes, and the best notes are unevenly distributed — locked in one high-performer's laptop, passed around informally, or never written down at all. There's no market that rewards the student who *does* write great notes, and no reliable way for a student in need to find the best version of a given course's material instead of whatever a friend happens to have.

## 2. Who this is for

- **Students** — want good notes for a specific course block, want to know they're buying the *best* version (not just *a* version), and want a cheap, low-friction way to request notes that don't exist yet.
- **Scribes** (a subset of students) — capable note-takers who want to turn that skill into income, with their reputation actually visible and worth something.
- **Admins** — university staff or platform operators who need to keep quality and payouts trustworthy without manually reviewing everything.

## 3. Product principles

- **Competition, not assignment.** Multiple scribes can write notes for the same block. The market picks the winner via ratings and purchases — Veloce doesn't hand-assign who gets to write what.
- **Reputation is real and visible.** A scribe's trust level, ratings, and follower count are the actual mechanism buyers use to choose between competing versions — not a vanity metric.
- **Demand should be visible before supply exists.** The request/voting feed lets students signal what's missing *before* a scribe commits time to writing it, and rewards the students who asked for it with a discount when it arrives.
- **Money logic must be provably fair, not just "probably right."** Refunds, credit, and scribe payouts are modeled so the platform's own revenue is never silently eaten into by a refund, and a scribe is never shortchanged because a buyer used credit. (See `ARCHITECTURE.md` §5 for exactly how.)
- **A watermark is a deterrent, not a lock.** Content is protected by making leaks traceable (every page view is watermarked with the viewer's identity), not by fighting usability with aggressive DRM.

## 4. Core user flows

1. **Student buys a note.** Browse → pick a course/block → compare competing scribes' versions (rating, trust level) → buy → read in-browser, watermarked.
2. **Student requests a note that doesn't exist.** Post a request (or vote on an existing one for the same course) → gets notified the moment a scribe fulfills it → buys at a discount.
3. **Scribe uploads.** Pick or create a course/block → write at least 3 topics → upload a PDF → automated quality/duplicate screening → live immediately, or held for admin review if flagged (always true on a scribe's very first upload, regardless of what the automated check finds).
4. **Scribe gets paid.** Sales accumulate as earnings → request a withdrawal → admin approves → real bank transfer via Paystack.
5. **Admin moderates.** Flagged notes, scribe applications, reports, and appeals all land in review queues, scoped strictly to the admin's own university.
6. **A refund happens.** Admin refunds a purchase → buyer loses access, gains spendable credit → platform's own cut of that original sale is untouched → the reclaimed scribe cut becomes available for the buyer to spend on a *different* scribe's note later.

## 5. Feature requirements by role

The authoritative, exhaustive version of this section is the three PDFs shipped alongside this document (`veloce-student-features.pdf`, `veloce-scribe-features.pdf`, `veloce-admin-features.pdf`) — this section is the short form.

**Student:** account + email verification, catalog browsing with competing-note comparison, purchase + in-browser watermarked reading, ratings/reviews, request + vote on demand, follow scribes, refund requests, in-app notifications, scribe application.

**Scribe (additive on student access):** upload with automated + manual quality gating, demand-feed visibility, request fulfillment, trust-level progression, earnings + withdrawal, follower notifications on new uploads.

**Admin (additive on scribe + student access):** moderation queues (notes, applications, reports, appeals), user management (ban/unban, promote/demote), refunds, payouts, and a finance dashboard — all scoped to one university.

## 6. Non-goals (explicitly out of scope right now)

- Multi-university launch — the schema supports it, but only one university is live. See `MVP.md`.
- Any subscription or bundle pricing model — every block is purchased individually, permanently.
- Native mobile apps — this is a responsive web app only.
- Any scheduled/cron-driven engagement (digest emails, "come back" reminders on a timer) — every notification in the product today fires off a specific user action, never off a clock. See `ARCHITECTURE.md` §7 for why this is a real current constraint, not just an unbuilt feature.
- Public API / third-party integrations.

## 7. Success metrics (suggested — not yet instrumented)

- **Liquidity per course**: % of active course blocks with at least one LIVE note.
- **Repeat purchase rate**: % of students who buy a second note within a semester.
- **Fulfillment latency**: median time from a request reaching a meaningful vote count to a scribe fulfilling it.
- **Trust-level distribution**: what fraction of active scribes are Trusted/Elite vs New — a proxy for whether quality is actually improving over time, not just volume.
- **Refund rate** and, specifically, what fraction of refund credit actually gets re-spent (vs sitting idle) — a proxy for whether the credit-instead-of-cash-back model is working for buyers.
