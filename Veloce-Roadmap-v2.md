# Veloce — Updated Project Roadmap & Blueprint (v2)

*Academic notes marketplace — piloting at Babcock University*

> This roadmap builds on the original Veloce SRS, updated with the demand-driven request feed, competing scribe uploads, ratings, and multi-university architecture decided since.

---

## 1. Executive Summary & Business Model

**The Problem:** Students rely on scattered WhatsApp groups, photocopied handouts, and disorganized past questions — leading to fragmented, stressful exam prep.

**The Solution:** Veloce organizes course syllabi into digestible **Blocks** (e.g. Block 1: Foundations, Block 2: CA Prep, Block 3: Exam Prep), sold instantly via secure online payment, written by verified student **Scribes**.

**Revenue Mechanics:**
- Standard pricing: **₦1,000 per block**
- Split: **60% to the Scribe, 40% to Veloce (platform)**
- Requesters who fulfill get **10–15% off** the block they requested
- Launch: Babcock University pilot, architected for multi-university scaling from day one

---

## 2. User Roles & Account Architecture

Role-based access control (RBAC), with higher roles inheriting lower-tier permissions: **Admin > Scribe > Student**.

| Role | Access |
|---|---|
| **Student** (default) | Browse catalog, post requests, purchase/own blocks, rate & review, view scribe profiles |
| **Scribe / Vendor** | Everything a Student can do, plus: apply-approved upload access, demand feed, content authoring, payout dashboard, public profile |
| **Admin (CEO)** | Everything above, plus: application review queue, content moderation queue, financial ledger, multi-campus directory routing |

Promotion flow (Student → Scribe) follows the original design: on admin approval, the user's role array updates in the database; a fresh session token with updated claims is issued on next login; the frontend router swaps in the Scribe Workspace.

---

## 3. Core Data Model

```
Universities
  └── Departments
        └── Courses
              └── Blocks
                    ├── Notes (PDF uploads, one-to-many: competing scribe versions)
                    ├── Requests (demand signals, grouped per block)
                    └── Purchases (buyer, price paid, discount applied)

Users (Student / Scribe / Admin)
  ├── ScribeApplications (pending / approved / rejected)
  ├── ScribeProfile (public: name, rating, past uploads)
  ├── Purchases (owned blocks — permanent access)
  ├── Requests (posted by student)
  └── Reviews (left on purchased notes)

Payouts (per scribe, per block, 60% share, Paystack transfer record)
```

Key relationships that differ from a typical single-vendor marketplace:
- **Blocks can have multiple competing Notes** (from different scribes) — students choose which to buy based on ratings.
- **Requests roll up by course + block** rather than being 1:1 — this is the "demand feed" signal.
- Every table below `Universities` is scoped by `university_id`, so Babcock and any future campus never see each other's data.

---

## 4. Functional Requirements

| ID | Module | Feature | Description | Role |
|---|---|---|---|---|
| FR-01 | Auth | Tiered Access Control | Email/password registration & login with Student / Scribe / Admin states | All |
| FR-02 | Auth | Institutional Profiling | Every account links to a University, Department/Faculty, and level | All |
| FR-03 | Auth | Scribe Application Pipeline | Students apply to become scribes; admin manually approves | Student/Scribe |
| FR-04 | Student Portal | Course & Block Catalog | Browse catalog by university → course → block, with lock/unlock status | Student |
| FR-05 | Student Portal | Secure Paywall | Paystack integration for the ₦1,000 block fee (with discount logic for fulfilled requesters) | Student |
| FR-06 | Student Portal | Instant Access Webhook | Server-side webhook unlocks the block instantly on payment success | Student |
| FR-07 | Student Portal | Scribe Profiles | Public profile per scribe: name, star rating, past uploads | Student |
| FR-08 | Student Portal | Ratings & Reviews | Buyers can leave a star rating + review on any note they've purchased | Student |
| FR-09 | **Demand Feed** | Post a Request | Student requests a course+block that doesn't exist yet | Student |
| FR-10 | **Demand Feed** | Auto-Grouping | Requests for the same course+block roll into one card with a demand counter ("12 students want this") | System |
| FR-11 | **Demand Feed** | Scribe Discovery Feed | Scribes browse a ranked feed of open requests (by demand count / recency / their own courses) | Scribe |
| FR-12 | Scribe Workspace | Claim & Upload | Scribe claims a request (multiple scribes may compete on the same one) and uploads a PDF | Scribe |
| FR-13 | Scribe Workspace | Automated Quality Gate | On upload: similarity/plagiarism check against existing notes in the same block, plus an AI completeness/quality pass | System |
| FR-14 | Scribe Workspace | Manual Spot Review | Uploads flagged by the automated gate (or randomly sampled) go to an admin review queue before going live | Admin |
| FR-15 | Scribe Workspace | Payout Timeline | Standard payout cycle clears 2 weeks after a block phase ends; early withdrawal appeal available if checklist is 100% complete | Scribe |
| FR-16 | Scribe Workspace | Performance Metrics | Scribes see traffic tiers, subscriber counts, and ratings — not platform-side margin data | Scribe |
| FR-17 | Admin Hub | Application Review Queue | Approve/reject scribe applications; toggle account states | Admin |
| FR-18 | Admin Hub | Content Moderation Queue | Review flagged uploads from the automated quality gate | Admin |
| FR-19 | Admin Hub | Financial & Audit Ledger | Platform-wide gross metrics, pending scribe liabilities, net platform income (40%), transaction logs | Admin |
| FR-20 | Admin Hub | Multi-Campus Directory Routing | Manage institutional boundaries and sub-directories per university (e.g. `/babcock`, `/unilag`) | Admin |

---

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-01 | Performance | Payment webhooks and content unlocking must resolve within 2 seconds |
| NFR-02 | Compatibility | Fully responsive web client, optimized for mobile viewports (majority of student traffic) |
| NFR-03 | Security | Passwords hashed with bcrypt; session/database tokens protected against unauthorized extraction |
| NFR-04 | Architecture | Backend must keep synchronized sessions, purchase state, and scribe workflows ready to extend from Web to future Mobile/Desktop clients |
| NFR-05 | Multi-tenancy | All catalog, request, and transaction data scoped per university from day one — even with only Babcock live |

---

## 6. Build Roadmap — Phased Plan

### Phase 1 — Project Setup & Architecture Foundation
- **1.1** Initialize repo (Next.js + Prisma + Neon Postgres), configure environment variables (DB URL, JWT secret, Paystack sandbox keys)
- **1.2** Design and migrate the core schema: `Universities`, `Departments`, `Courses`, `Blocks`, `Users`, `Transactions`

### Phase 2 — Authentication & RBAC Engine
- **2.1** Email/password registration & login with institutional profiling (university/department/level)
- **2.2** Role & privilege middleware (`student` / `scribe` / `admin`), with higher roles inheriting lower-tier access

### Phase 3 — Student Portal & Payments
- **3.1** Course/block catalog browsing UI
- **3.2** Paystack integration for the ₦1,000 block fee, with server-side webhook to instantly unlock content
- **3.3** Purchased-block library (permanent access, tied to account)

### Phase 4 — Scribe Application & Content Pipeline
- **4.1** Scribe application form + admin approval queue (manual)
- **4.2** Upload flow (PDF only) tied to a block
- **4.3** Automated quality gate: similarity/plagiarism check + AI completeness pass, with flagged items routed to manual spot review
- **4.4** Public scribe profile page (name, rating, upload history)

### Phase 5 — Demand Feed (Request & Discovery System)
- **5.1** Student-facing "Request a Block" flow
- **5.2** Auto-grouping logic: requests roll up per course+block with a live demand counter
- **5.3** Scribe-facing discovery feed, ranked by demand/recency, with claim-and-compete support (multiple scribes can upload for the same request)
- **5.4** Notify original requesters when a claimed block goes live; apply their 10–15% discount at checkout

### Phase 6 — Ratings, Reviews & Scribe Reputation
- **6.1** Star rating + written review on purchased notes
- **6.2** Aggregate rating rollup on scribe profiles and note listings (critical once multiple scribes compete on one block)

### Phase 7 — Financial Ledger & Payouts
- **7.1** Admin financial dashboard: gross inflows, pending scribe liabilities, net platform income (40%)
- **7.2** Automated Paystack payouts to scribes on the standard 2-week cycle, with early-withdrawal appeal path
- **7.3** Multi-campus directory routing (e.g. `/babcock`, ready for `/unilag` etc.)


