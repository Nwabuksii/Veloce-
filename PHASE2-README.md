# Phase 2 — pricing and purchases (overlay)

Unzip over the project root (paths match `Veloce-internal/`). Overwrites 8 files, adds none. No schema change, no migration. Independent of Phase 1.

| # | Change | Files |
|---|---|---|
| 10, 16, 17 | One block-level price: a buyer who voted for the request a block fulfils pays ₦900 for EVERY version in it; everyone else pays the block price (₦1,000). `getEffectivePriceForNote` is replaced by `getBlockPriceForBuyer`; catalog, version picker, credit dialog and checkout all use it, so they agree | `lib/pricing.ts`, `lib/pricing.test.ts`, `app/api/payments/initialize/route.ts`, `app/api/blocks/route.ts`, `app/api/blocks/[id]/notes/route.ts` |
| 4 | Scribe buying their own note: a confirm dialog ("This is your own note"), then the purchase goes through as a normal sale. Server already required `confirmSelfPurchase`; both buy flows now send it after the confirm | `app/blocks/[id]/page.tsx`, `app/dashboard/page.tsx` |
| 18 | Library "Notes owned" excludes refunded purchases | `app/purchases/page.tsx` |
| 21 | Block purchase count (catalog + block page) and per-version count exclude refunded purchases. The scribe-wide trust-badge sales count is unchanged | `app/api/blocks/route.ts`, `app/api/blocks/[id]/notes/route.ts` |

Behaviour notes
- "Requested" = the buyer has a vote on a request whose `blockId` is this block (set when a scribe creates the block from that request).
- Old purchases keep the price they were charged. The scribe still gets the fixed ₦600 on a ₦900 sale.
- The "Terms §4" wording ("₦900 for every buyer") still needs updating to "for students who requested it" — that is a Phase 5 text change.
- Not type-checked or run here (no `node_modules`): please run `npm run typecheck` and `npm test` (the pricing test was updated).
