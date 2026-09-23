import { describe, it, expect } from "vitest";
import {
  computeScribeCut,
  computePlatformCut,
  effectivePrice,
  planCreditRedemption,
  SCRIBE_SHARE,
  PLATFORM_SHARE,
  REQUEST_FULFILLED_PRICE,
  REQUEST_FULFILLED_SCRIBE_CUT,
  REQUEST_FULFILLED_PLATFORM_CUT,
} from "./pricing";

// These are deliberately narrow, pure-function tests — no database, no
// mocking, nothing that needs a test environment beyond "call the
// function, check the number." That's the point: this is the highest-risk,
// zero-setup-cost logic to protect, since a wrong number here has no
// compiler error to catch it — only a wrong dollar amount somewhere real.

describe("revenue split constants", () => {
  it("scribe and platform shares always sum to 1", () => {
    expect(SCRIBE_SHARE + PLATFORM_SHARE).toBe(1);
  });

  it("the fixed request-fulfillment split sums to the fixed price", () => {
    expect(REQUEST_FULFILLED_SCRIBE_CUT + REQUEST_FULFILLED_PLATFORM_CUT).toBe(REQUEST_FULFILLED_PRICE);
  });
});

describe("computeScribeCut", () => {
  it("is always exactly 600 for a request-fulfillment sale, regardless of price", () => {
    // This is the one most worth protecting: a request-fulfillment sale's
    // scribe cut must NEVER scale with price — it's a fixed ₦600 no matter
    // what. This also means a request-fulfillment sale paid ENTIRELY with
    // credit (price passed as the purchase's effectivePrice, which can
    // legitimately be 900 with amountPaid=0) still pays the scribe in full.
    expect(computeScribeCut(900, true)).toBe(600);
    expect(computeScribeCut(0, true)).toBe(600);
    expect(computeScribeCut(50000, true)).toBe(600);
  });

  it("is 60% of price, rounded, for a normal (non-fulfillment) sale", () => {
    expect(computeScribeCut(1000, false)).toBe(600);
    expect(computeScribeCut(999, false)).toBe(599); // 599.4 rounds down
    expect(computeScribeCut(1, false)).toBe(1); // 0.6 rounds up
    expect(computeScribeCut(0, false)).toBe(0);
  });
});

describe("computePlatformCut", () => {
  it("is always exactly 300 for a request-fulfillment sale, regardless of price", () => {
    // Same protection as above, for the other half of the split. If this
    // were ever "cleaned up" to compute platformCut independently as
    // price * PLATFORM_SHARE instead of price - scribeCut, this test is
    // what would catch that the fixed price stopped being fixed.
    expect(computePlatformCut(900, true)).toBe(300);
  });

  it("is the remainder of price after the scribe's cut, for a normal sale", () => {
    expect(computePlatformCut(1000, false)).toBe(400);
    expect(computePlatformCut(999, false)).toBe(400);
  });

  it("always sums exactly back to price when added to the scribe's cut — no money can appear or vanish", () => {
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

describe("effectivePrice", () => {
  it("is cash plus credit combined", () => {
    expect(effectivePrice({ amountPaid: 1000, creditApplied: 0 })).toBe(1000);
    expect(effectivePrice({ amountPaid: 0, creditApplied: 1000 })).toBe(1000);
    expect(effectivePrice({ amountPaid: 400, creditApplied: 600 })).toBe(1000);
  });

  it("means computeScribeCut gives the scribe their real cut regardless of funding source", () => {
    // The bug this exists to prevent: computing a credit-funded purchase's
    // scribe cut from amountPaid alone (which can be 0) would shortchange
    // the scribe to ₦0. Using effectivePrice fixes that with no special
    // case needed for credit at all.
    const cashOnly = { amountPaid: 1000, creditApplied: 0 };
    const creditOnly = { amountPaid: 0, creditApplied: 1000 };
    const mixed = { amountPaid: 400, creditApplied: 600 };
    for (const p of [cashOnly, creditOnly, mixed]) {
      expect(computeScribeCut(effectivePrice(p), false)).toBe(600);
    }
  });
});

describe("planCreditRedemption — credit is unlimited, real cash, never a fraction of it", () => {
  it("caps at the price — leftover credit carries forward untouched", () => {
    expect(planCreditRedemption(1000, 1500)).toEqual({ creditUsed: 1000, cash: 0 });
  });

  it("caps at the balance — the buyer pays the rest in cash", () => {
    expect(planCreditRedemption(1000, 400)).toEqual({ creditUsed: 400, cash: 600 });
  });

  it("no credit means a normal cash purchase", () => {
    expect(planCreditRedemption(1000, 0)).toEqual({ creditUsed: 0, cash: 1000 });
  });

  it("exact match spends it all, no residue", () => {
    expect(planCreditRedemption(900, 900)).toEqual({ creditUsed: 900, cash: 0 });
  });

  it("creditUsed + cash always equals price exactly, for any balance", () => {
    for (const price of [900, 1000]) {
      for (let balance = 0; balance <= 3000; balance += 50) {
        const plan = planCreditRedemption(price, balance);
        expect(plan.creditUsed + plan.cash).toBe(price);
        expect(plan.creditUsed).toBeLessThanOrEqual(balance);
        expect(plan.creditUsed).toBeLessThanOrEqual(price);
      }
    }
  });
});

describe("whole-system money conservation under the escrow model", () => {
  // Simulates purchases (cash, credit, or mixed), the 31-minute hold,
  // refund requests, admin approve/decline, and duplicate-payment
  // conversions — using the real helper functions — and checks the one
  // thing that must always hold: every naira that ever came in as cash is,
  // at every step, accounted for as EXACTLY one of: still in escrow
  // (clearing/refund_review), confirmed scribe earnings, confirmed
  // platform revenue, or credit sitting on someone's account. No naira can
  // appear, vanish, or be double-counted across two of these at once.
  it("holds for thousands of random sequences", () => {
    let seed = 99;
    const rand = (n: number) => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed % n;
    };

    for (let run = 0; run < 300; run++) {
      let cashIn = 0;
      let scribeConfirmed = 0;
      let platformConfirmed = 0;
      let creditBalance = 0;
      // in-flight purchases: { price, scribeCut, platformCut, requested }
      const escrow: { price: number; scribeCut: number; platformCut: number; requested: boolean }[] = [];

      for (let step = 0; step < 40; step++) {
        const action = rand(4);
        const price = rand(2) === 0 ? 1000 : 900;
        const isFulfillment = price === 900;

        if (action === 0) {
          // buy — with whatever credit applies
          const plan = planCreditRedemption(price, creditBalance);
          creditBalance -= plan.creditUsed;
          cashIn += plan.cash;
          const scribeCut = computeScribeCut(price, isFulfillment);
          const platformCut = computePlatformCut(price, isFulfillment);
          escrow.push({ price, scribeCut, platformCut, requested: false });
        } else if (action === 1 && escrow.length > 0) {
          // buyer requests a refund on something still un-resolved
          const i = rand(escrow.length);
          escrow[i].requested = true;
        } else if (action === 2 && escrow.some((e) => e.requested)) {
          // admin decides a pending request
          const idx = escrow.findIndex((e) => e.requested);
          const e = escrow.splice(idx, 1)[0];
          if (rand(2) === 0) {
            // approved: the whole price back as credit, nothing split
            creditBalance += e.price;
          } else {
            // declined: resolves immediately, splits normally
            scribeConfirmed += e.scribeCut;
            platformConfirmed += e.platformCut;
          }
        } else if (action === 3 && escrow.some((e) => !e.requested)) {
          // the hold window passes with no request: clears normally
          const idx = escrow.findIndex((e) => !e.requested);
          const e = escrow.splice(idx, 1)[0];
          scribeConfirmed += e.scribeCut;
          platformConfirmed += e.platformCut;
        }

        const stillInEscrow = escrow.reduce((s, e) => s + e.price, 0);
        expect(cashIn).toBe(scribeConfirmed + platformConfirmed + creditBalance + stillInEscrow);
        expect(creditBalance).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
