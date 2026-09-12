// The platform's revenue split — scribes keep 60% of every sale, the
// platform takes 40%. Centralized here so every place that needs to
// reason about revenue (admin ledger, future payout logic) reads from
// one source instead of re-hardcoding the percentage.
export const SCRIBE_SHARE = 0.6;
export const PLATFORM_SHARE = 1 - SCRIBE_SHARE;

// Founder-set fixed pricing for any note that fulfills a student request
// (Note.fulfillsRequestId is set). This overrides the normal scribe-set
// block price AND the normal 60/40 percentage split entirely — every
// request-fulfillment sale is always ₦900 total, always ₦600 to the
// scribe, always ₦300 to the platform, no rounding involved since the
// numbers are exact. Applies to every buyer of that note, not just the
// student(s) who originally voted for the request.
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
