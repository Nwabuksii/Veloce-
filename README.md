# Veloce — Phase 1 Scaffold

This is the Phase 1 foundation: project setup + database schema.

## What's here
- `prisma/schema.prisma` — the full data model (universities, courses, blocks, users, notes, the demand-feed request system, purchases, reviews, payouts)
- `package.json` — dependencies for the stack (Next.js + Prisma + bcrypt + JWT)
- `.env.example` — the environment variables you'll need
- `lib/prisma.ts` — a Prisma client helper you'll reuse everywhere in the backend

## To run this locally

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up your environment**
   ```bash
   cp .env.example .env
   ```
   Then fill in:
   - `DATABASE_URL` — your existing Neon connection string
   - `JWT_SECRET` — any long random string (e.g. `openssl rand -base64 32`)
   - `PAYSTACK_SECRET_KEY` / `PAYSTACK_PUBLIC_KEY` — from your Paystack dashboard (use test keys first)

3. **Push the schema to your Neon database**
   ```bash
   npx prisma migrate dev --name init
   ```
   This creates all the tables in your Neon Postgres instance and generates the Prisma client.

4. **(Optional) Browse your database visually**
   ```bash
   npx prisma studio
   ```

Once this runs cleanly against your Neon database, Phase 1 is done and we move to Phase 2 (authentication & RBAC).

## Schema notes — why it's shaped this way

- **`University → Department → Course → Block`**: every piece of content is scoped under a university via foreign keys, so Babcock and any future campus are isolated by construction, not just by a `WHERE` clause you have to remember.
- **`Note` is many-to-one with `Block`**: this is what allows multiple scribes to compete on the same block — each upload is its own row, each with its own rating.
- **`BlockRequest` + `RequestVote`**: this is the demand feed. `RequestVote` is one row per student who requested a block — the count of votes *is* the demand counter, and it's what lets us know who gets the discount when it's fulfilled.
- **`Payout` is separate from `Purchase`**: purchases happen instantly (one per sale); payouts are batched and released on the 2-week cycle, so they're modeled independently.
