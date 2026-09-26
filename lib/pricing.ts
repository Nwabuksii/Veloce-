// The product rule we are using is deliberately fixed for each sale tier:
// - regular sale: scribe gets ₦600, platform keeps the remainder of the sale
// - request-fulfilled sale: the buyer pays a fixed ₦900 total, so the scribe
//   keeps ₦600 and the platform keeps ₦300
//
// This is centralized here so the transaction ledger, payout logic, and buyer-
// facing pricing all read from one source of truth.
export const NORMAL_SCRIBE_CUT = 600;
export const NORMAL_PLATFORM_CUT = 400;
export const SCRIBE_SHARE = NORMAL_SCRIBE_CUT / 1000;
export const PLATFORM_SHARE = NORMAL_PLATFORM_CUT / 1000;

// Founder-set fixed pricing for any note that fulfills a student request
// (Note.fulfillsRequestId is set) — but only for the student(s) who actually
// requested it (has a RequestVote on that request). Everyone else still pays
// the scribe's normal block price. For an eligible buyer, the sale is fixed at
// ₦900 total: ₦600 to the scribe and ₦300 to the platform.
export const REQUEST_FULFILLED_PRICE = 900;
export const REQUEST_FULFILLED_SCRIBE_CUT = 600;
export const REQUEST_FULFILLED_PLATFORM_CUT = 300;

/**
 * The scribe's cut of one purchase, given the FULL price actually paid for
 * it — cash and credit combined (see effectivePrice below). Fixed ₦600 if
 * the note fulfilled a request, otherwise the normal 60% share.
 *
 * Pass the price, never `amountPaid` alone — a purchase paid wholly or
 * partly with credit has `amountPaid` less than its real price (0 for a
 * fully-credit purchase), and computing the scribe's cut off that alone
 * would shortchange them. Using the combined price instead means this one
 * formula is correct for every purchase, cash, credit, or a mix of both,
 * with no special case needed for credit — a ₦1,000 fulfillment-tier sale
 * and a ₦900 one both land on exactly ₦600 either way, since the
 * fulfillment tier is a fixed cut, not a percentage.
 *
 * Always compute per-purchase (never as one aggregate `gross * SCRIBE_SHARE`
 * across many purchases) — mixing fixed-price and percentage-price sales
 * into a single aggregate multiply would misallocate money on both sides.
 */
export function computeScribeCut(price: number, isRequestFulfillment: boolean): number {
  if (price <= 0) return 0;
  return isRequestFulfillment ? REQUEST_FULFILLED_SCRIBE_CUT : NORMAL_SCRIBE_CUT;
}

/**
 * On a normal sale, the platform keeps the rest of the actual sale after the
 * fixed ₦600 scribe payout. On an eligible request-discounted sale, the total
 * is fixed at ₦900 and the platform keeps ₦300.
 */
export function computePlatformCut(price: number, isRequestFulfillment: boolean): number {
  if (price <= 0) return 0;
  if (isRequestFulfillment) return REQUEST_FULFILLED_PLATFORM_CUT;
  return Math.max(0, price - NORMAL_SCRIBE_CUT);
}

/**
 * The actual price a buyer sees and pays for a specific note version.
 * A request-fulfillment price is only a real discount for the student who
 * voted on that exact request; everyone else still pays the block's base price.
 */
export function getEffectivePriceForNote({
  basePrice,
  fulfillsRequestId,
  buyerVotedForRequest,
}: {
  basePrice: number;
  fulfillsRequestId: string | null;
  buyerVotedForRequest: boolean;
}): number {
  if (fulfillsRequestId && buyerVotedForRequest) return REQUEST_FULFILLED_PRICE;
  return basePrice;
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
