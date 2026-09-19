import { describe, it, expect } from "vitest";
import {
  computeScribeCut,
  computePlatformCut,
  computeScribeCutForCreditRedemption,
  computePlatformCutForCreditRedemption,
  SCRIBE_SHARE,
  PLATFORM_SHARE,
  REQUEST_FULFILLED_PRICE,
  REQUEST_FULFILLED_SCRIBE_CUT,
  REQUEST_FULFILLED_PLATFORM_CUT,
  CREDIT_REDEMPTION_SCRIBE_CUT,
} from "./pricing";

// These are deliberately narrow, pure-function tests — no database, no
// mocking, nothing that needs a test environment beyond "call the
// function, check the number." That's the point: this is the highest-risk,
// zero-setup-cost logic to protect, since a wrong number here has no
// visual symptom at all — the site keeps working, purchases keep going
// through, and the only sign anything's wrong is a scribe eventually
// noticing their payout is short.

describe("revenue split constants", () => {
  it("scribe and platform shares always sum to 1", () => {
    expect(SCRIBE_SHARE + PLATFORM_SHARE).toBe(1);
  });

  it("the fixed request-fulfillment split sums to the fixed price", () => {
    expect(REQUEST_FULFILLED_SCRIBE_CUT + REQUEST_FULFILLED_PLATFORM_CUT).toBe(REQUEST_FULFILLED_PRICE);
  });
});

describe("computeScribeCut", () => {
  it("is always exactly 600 for a request-fulfillment sale, regardless of amountPaid", () => {
    // This is the one most worth protecting: a request-fulfillment sale's
    // scribe cut must NEVER scale with amountPaid — it's a fixed ₦600 no
    // matter what. amountPaid is even passed as 0 here on purpose, since
    // that's exactly what a coupon-redeemed purchase looks like in
    // practice (see app/api/payments/initialize/route.ts) — the scribe
    // must still be paid in full even though nothing was actually charged.
    expect(computeScribeCut(900, true)).toBe(600);
    expect(computeScribeCut(0, true)).toBe(600);
    expect(computeScribeCut(50000, true)).toBe(600);
  });

  it("is 60% of amountPaid, rounded, for a normal (non-fulfillment) sale", () => {
    expect(computeScribeCut(1000, false)).toBe(600);
    expect(computeScribeCut(999, false)).toBe(599); // 599.4 rounds down
    expect(computeScribeCut(1, false)).toBe(1); // 0.6 rounds up
    expect(computeScribeCut(0, false)).toBe(0);
  });
});

describe("computePlatformCut", () => {
  it("is always exactly 300 for a request-fulfillment sale, regardless of amountPaid", () => {
    // Same protection as above, for the other half of the split. If this
    // were ever "cleaned up" to compute platformCut independently as
    // amountPaid * PLATFORM_SHARE instead of amountPaid - scribeCut, this
    // test is what would catch that the fixed price stopped being fixed.
    expect(computePlatformCut(900, true)).toBe(300);
    expect(computePlatformCut(50000, true)).toBe(300);
  });

  it("is the remainder of amountPaid after the scribe's cut, for a normal sale", () => {
    expect(computePlatformCut(1000, false)).toBe(400);
    expect(computePlatformCut(999, false)).toBe(400);
  });

  it("always sums exactly back to amountPaid when added to the scribe's cut — no money can appear or vanish", () => {
    const amounts = [0, 1, 100, 900, 999, 1000, 50000];
    for (const amount of amounts) {
      for (const isFulfillment of [true, false]) {
        const scribeCut = computeScribeCut(amount, isFulfillment);
        const platformCut = computePlatformCut(amount, isFulfillment);
        expect(scribeCut + platformCut).toBe(amount);
      }
    }
  });
});

describe("credit redemption (refund coupons)", () => {
  // These pin down the exact scenarios from the spec: a refund reclaims
  // only the scribe's ₦600, never the platform's cut, and that ₦600 is a
  // fixed reassignment to whichever new scribe the credit is later spent
  // with — never a price/discount-based split of that new sale.

  it("scribe cut on any credit-redeemed sale is always fixed ₦600", () => {
    expect(computeScribeCutForCreditRedemption()).toBe(600);
    expect(computeScribeCutForCreditRedemption()).toBe(CREDIT_REDEMPTION_SCRIBE_CUT);
  });

  it("platform cut on a credit-redeemed sale is 100% of the cash actually charged, never split", () => {
    // Buying a discounted (₦900) block with a ₦900 face-value coupon:
    // credit fully covers it, no cash changes hands, nothing new to the platform.
    expect(computePlatformCutForCreditRedemption(0)).toBe(0);
    // Buying a non-discounted (₦1,000) block with a ₦900 face-value coupon:
    // ₦100 cash top-up, all ₦100 goes to the platform — not 60/40 split.
    expect(computePlatformCutForCreditRedemption(100)).toBe(100);
  });

  it("scribe cut plus platform cut on a credit-redeemed sale never reaches into the platform's original cut", () => {
    // Regardless of the cash top-up, the scribe's fixed ₦600 never comes
    // out of platformRevenue — it's reclaimed credit, not fresh revenue.
    const scribeCut = computeScribeCutForCreditRedemption();
    const cashTopUp = 100;
    const platformCut = computePlatformCutForCreditRedemption(cashTopUp);
    expect(scribeCut).toBe(600);
    expect(platformCut).toBe(cashTopUp); // never scribeCut-adjusted, never negative
  });
});
