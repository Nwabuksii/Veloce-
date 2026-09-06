// The platform's revenue split — scribes keep 60% of every sale, the
// platform takes 40%. Centralized here so every place that needs to
// reason about revenue (admin ledger, future payout logic) reads from
// one source instead of re-hardcoding the percentage.
export const SCRIBE_SHARE = 0.6;
export const PLATFORM_SHARE = 1 - SCRIBE_SHARE;

// Flat discount for students who requested a block that later got fulfilled
// by a scribe. Founder confirmed 10% as the default — bump this (or make it
// per-request) if they want it configurable later.
export const REQUEST_FULFILLED_DISCOUNT = 0.1;

export function applyRequestDiscount(price: number): number {
  return Math.round(price * (1 - REQUEST_FULFILLED_DISCOUNT));
}

// Withdrawals — a scribe can request one withdrawal per calendar month,
// only during the first 7 days of that month, for any amount up to their
// available balance, above this floor.
export const MIN_WITHDRAWAL_AMOUNT = 2000;
export const WITHDRAWAL_WINDOW_DAY_END = 7; // requests only allowed on day-of-month 1 through this
