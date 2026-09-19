// The platform's revenue split — scribes keep 60% of every sale, the
// platform takes 40%. Centralized here so every place that needs to
// reason about revenue (admin ledger, future payout logic) reads from
// one source instead of re-hardcoding the percentage.
export const SCRIBE_SHARE = 0.6;
export const PLATFORM_SHARE = 1 - SCRIBE_SHARE;

// Founder-set fixed pricing for any note that fulfills a student request
// (Note.fulfillsRequestId is set) — but only for the student(s) who actually
// requested it (has a RequestVote on that request). Everyone else still pays
// the scribe's normal block price. For an eligible buyer this overrides the
// normal scribe-set block price AND the normal 60/40 percentage split
// entirely — always ₦900 total, always ₦600 to the scribe, always ₦300 to
// the platform, no rounding involved since the numbers are exact.
export const REQUEST_FULFILLED_PRICE = 900;
export const REQUEST_FULFILLED_SCRIBE_CUT = 600;
export const REQUEST_FULFILLED_PLATFORM_CUT = REQUEST_FULFILLED_PRICE - REQUEST_FULFILLED_SCRIBE_CUT;

/**
 * The scribe's cut of one purchase. Fixed ₦600 if the note fulfilled a
 * request, otherwise the normal 60% share of whatever was actually paid.
 * Always compute per-purchase (never as one aggregate `gross * SCRIBE_SHARE`
 * across many purchases) — mixing fixed-price and percentage-price sales
 * into a single aggregate multiply would misallocate money on both sides.
 */
export function computeScribeCut(amountPaid: number, isRequestFulfillment: boolean): number {
  return isRequestFulfillment ? REQUEST_FULFILLED_SCRIBE_CUT : Math.round(amountPaid * SCRIBE_SHARE);
}

/** The platform's cut is always the remainder, so the two always sum exactly to amountPaid. */
export function computePlatformCut(amountPaid: number, isRequestFulfillment: boolean): number {
  return amountPaid - computeScribeCut(amountPaid, isRequestFulfillment);
}

// ─────────────────────────────────────────────
// Credit redemption (refund coupons)
// ─────────────────────────────────────────────
//
// When a purchase is refunded, the platform's cut on that original sale is
// NEVER touched — it stays banked, permanently. Only the scribe's cut
// (always ₦600, whether the original sale was the flat 1000 tier or the
// 900 request-fulfilled tier) is reversible, and it's granted back to the
// buyer as spendable credit. The credit's FACE VALUE the buyer sees and
// spends against (₦900 or ₦1,000 — see app/api/admin/purchases/[id]/refund)
// is bigger than that ₦600 on purpose: it's what determines how much extra
// cash, if any, they need to add when redeeming it. But only ₦600 of it
// ever actually MOVES anywhere — to whichever new scribe they buy from.
//
// So any time a purchase is paid for using credit (fully or partially):
//   - the scribe gets this fixed cut, never a price/discount-based one
//   - the platform's cut is exactly whatever fresh cash the buyer pays on
//     top of their credit — 100% of it, never split 60/40 — because that
//     cash is the ONLY new money involved. The ₦600 to the scribe is a
//     reassignment of money already collected (and reversed) on the
//     original sale, not a new expense the platform is absorbing.
// This is what keeps "refunds never touch the platform's cut" true even
// after the credit gets spent somewhere else.
export const CREDIT_REDEMPTION_SCRIBE_CUT = REQUEST_FULFILLED_SCRIBE_CUT; // ₦600, fixed

/** Scribe's cut on any purchase paid for (wholly or partly) with credit — always fixed, never price-based. */
export function computeScribeCutForCreditRedemption(): number {
  return CREDIT_REDEMPTION_SCRIBE_CUT;
}

/**
 * Platform's cut on a credit-redeemed purchase — 100% of the actual cash
 * charged (`amountPaid`), since the credit portion isn't fresh revenue.
 * Named separately from computePlatformCut so it's never confused with the
 * proportional-split version used for normal (non-credit) sales.
 */
export function computePlatformCutForCreditRedemption(amountPaid: number): number {
  return amountPaid;
}

// Withdrawals — a scribe can request one withdrawal per calendar month,
// only during the first 7 days of that month, for any amount up to their
// available balance, above this floor.
export const MIN_WITHDRAWAL_AMOUNT = 2000;
export const WITHDRAWAL_WINDOW_DAY_END = 7; // requests only allowed on day-of-month 1 through this

// How long a buyer has to request a refund after purchasing, and — the
// flip side of the same window — how long a sale sits as "pending" before
// a scribe can actually count it as earned/withdrawable. Both read from
// this single constant so they can never drift out of sync with each other.
export const REFUND_WINDOW_MINUTES = 30;
