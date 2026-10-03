// THE SPLIT — one rule, used everywhere (ledger, finance pages, scribe
// earnings, withdrawals, analytics):
//   scribe cut   = ₦600 per sale (a fixed amount, not a percentage)
//   platform cut = total paid − scribe cut
// So a ₦1,000 sale is ₦600 / ₦400, and a ₦900 request-discounted sale is
// ₦600 / ₦300. Both cuts are always worked out per purchase, from the full
// price (cash + credit), never from a percentage of a total.
export const SCRIBE_CUT = 600;

// Founder-set fixed price for a note that fulfils a student request — but only
// for the student(s) who actually requested it (has a RequestVote on that
// request). Everyone else still pays the scribe's normal block price.
export const REQUEST_FULFILLED_PRICE = 900;

/**
 * The scribe's cut of one purchase: ₦600, or 0 for a free purchase. Pass the
 * FULL price (cash + credit, see effectivePrice below), not `amountPaid` alone.
 * The second argument is ignored — it is only kept so older callers still compile.
 */
export function computeScribeCut(price: number, _legacyIsRequestFulfillment?: boolean): number {
  return price > 0 ? SCRIBE_CUT : 0;
}

/**
 * The platform's cut of one purchase: everything paid after the scribe's ₦600.
 * Scribe cut + platform cut always equals the price paid. The second argument
 * is ignored (kept so older callers still compile).
 */
export function computePlatformCut(price: number, _legacyIsRequestFulfillment?: boolean): number {
  if (price <= 0) return 0;
  return Math.max(0, price - computeScribeCut(price));
}

/**
 * The price a buyer pays for ANY version in a block: ₦900 if they voted for
 * the request that block fulfils, otherwise the block's base price. Same
 * number for every version in the block, so the catalog, the version picker
 * and checkout can never disagree.
 */
export function getBlockPriceForBuyer({
  basePrice,
  buyerRequestedBlock,
}: {
  basePrice: number;
  buyerRequestedBlock: boolean;
}): number {
  return buyerRequestedBlock ? Math.min(basePrice, REQUEST_FULFILLED_PRICE) : basePrice;
}

/** The real price of a purchase — cash actually charged plus whatever credit was applied toward it. */
export function effectivePrice(p: { amountPaid: number; creditApplied: number }): number {
  return p.amountPaid + p.creditApplied;
}

// ─────────────────────────────────────────────
// Escrow: when a sale's money actually becomes the scribe's / the
// platform's, and what a refund means under that.
// ─────────────────────────────────────────────
//
// A purchase's price is NOT split between the scribe and the platform the
// moment it's paid for. It sits in escrow — recognized as nobody's money
// yet — until it's RESOLVED, one of two ways:
//
//   1. EARNINGS_HOLD_MINUTES pass with no refund request from the buyer.
//      The full price splits normally: the scribe's cut per computeScribeCut
//      above, the rest to the platform. This is the "clearing" state while
//      it waits (see SaleStatus in lib/withdrawal.ts) — the money isn't
//      anybody's until it clears.
//   2. The buyer requests a refund inside that window (see
//      app/api/purchases/[id]/refund-request). The sale moves to
//      "refund_review" and stops the clock completely — it stays held,
//      however long the admin takes, until they decide:
//        - Approved: the ENTIRE price (cash + credit, dollar for dollar)
//          is handed back to the buyer as credit. Nothing is split, because
//          nothing was ever earned by anyone on this sale — it was in
//          escrow the whole time, never disbursed. This is exactly why a
//          refund never has to be clawed back from a scribe or reversed
//          out of platform revenue: by construction, an approved refund is
//          only ever possible before that money became anyone's.
//        - Declined: resolves immediately (not after any further wait) —
//          the price splits normally right away, same as case 1.
//
// The consequence: credit is ALWAYS real, unencumbered cash — every naira a
// buyer sees in their credit balance is a naira Veloce is actually holding,
// never yet paid to a scribe or booked as platform revenue. Spending it is
// just paying with cash that happens to already be on account: the new
// purchase goes through the exact same escrow → clearing/refund-review →
// resolved pipeline as any other, and only ONE thing is capped when
// applying it — you can never apply more than the price itself, so a
// leftover credit larger than what you're buying just carries the rest
// forward (see planCreditRedemption below).

export interface CreditRedemptionPlan {
  /** How much of the buyer's credit is applied toward this purchase (₦). */
  creditUsed: number;
  /** Fresh cash the buyer must pay on top (₦) — 0 means fully covered by credit. */
  cash: number;
}

/**
 * How a purchase of `price` is paid for, given the buyer's credit balance.
 * Credit is unlimited and never expires — this only ever caps at two
 * things: you can't apply more credit than you have, and you can't apply
 * more than the price (the remainder carries forward as credit, unspent).
 */
export function planCreditRedemption(price: number, creditBalance: number): CreditRedemptionPlan {
  const creditUsed = Math.max(0, Math.min(creditBalance, price));
  return { creditUsed, cash: price - creditUsed };
}

// Withdrawals — a scribe can request one withdrawal per calendar month,
// only during the first 7 days of that month, for any amount up to their
// available balance, above this floor.
export const MIN_WITHDRAWAL_AMOUNT = 2000;
export const WITHDRAWAL_WINDOW_DAY_END = 7; // requests only allowed on day-of-month 1 through this

// How long a buyer has to request a refund after purchasing. Once
// requested, the sale is held indefinitely (see saleStatus in
// lib/withdrawal.ts) regardless of this window — it's purely the deadline
// for FILING the request, not for how long a filed one can be reviewed.
export const REFUND_WINDOW_MINUTES = 30;

// The scribe's/platform's money is released a moment AFTER the buyer's
// refund window closes, not at the same instant. A buyer whose request
// lands at 29:59.9 is allowed, but the request takes a few milliseconds to
// actually save — released at exactly 30:00, a resolution calculated in
// that gap would clear the sale just before the refund request appears. A
// one-minute margin removes that gap completely (a simulation of thousands
// of random refund/credit sequences lost money only in that gap).
export const EARNINGS_RELEASE_GRACE_MINUTES = 1;
export const EARNINGS_HOLD_MINUTES = REFUND_WINDOW_MINUTES + EARNINGS_RELEASE_GRACE_MINUTES;
