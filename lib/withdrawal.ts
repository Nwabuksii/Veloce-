import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeScribeCut, effectivePrice, MIN_WITHDRAWAL_AMOUNT, WITHDRAWAL_WINDOW_DAY_END, EARNINGS_HOLD_MINUTES } from "@/lib/pricing";

// Every helper below can run against the normal client or inside a
// transaction — the payout request needs the second, so its balance check
// and its insert are one atomic step (see app/api/scribe/payouts).
type Db = Prisma.TransactionClient;

/**
 * Where one sale's money currently sits — see the escrow model in
 * lib/pricing.ts. Nobody (not the scribe, not the platform) owns any of it
 * until it's "confirmed":
 *   clearing      — still inside the refund window, buyer hasn't requested
 *                   one. Clears to "confirmed" on its own once the window
 *                   passes.
 *   refund_review — the buyer requested a refund and an admin hasn't
 *                   decided yet. Held indefinitely — the clock stops
 *                   completely — until they do: approving refunds the
 *                   whole price as credit (nothing was ever anyone's to
 *                   reverse), declining resolves it to "confirmed"
 *                   immediately, without waiting out the rest of the window.
 *   confirmed     — resolved, one way or the other: the window passed with
 *                   no request, or an admin explicitly declined one. The
 *                   scribe and platform cuts are real from this point on.
 * A PENDING refund report beats the clock in one direction (holds
 * indefinitely); a DISMISSED one beats it in the other (resolves
 * immediately) — both regardless of how much or little of the window has
 * elapsed.
 */
export type SaleStatus = "confirmed" | "clearing" | "refund_review";

export function saleStatus(p: { purchasedAt: Date; reports: { status: string }[] }, holdCutoff: Date): SaleStatus {
  if (p.reports.some((r) => r.status === "PENDING")) return "refund_review";
  if (p.reports.some((r) => r.status === "DISMISSED")) return "confirmed";
  return p.purchasedAt <= holdCutoff ? "confirmed" : "clearing";
}

/**
 * The scribe's cut of one purchase — always computed from the real price
 * (cash + credit combined, see effectivePrice in lib/pricing.ts), never
 * from amountPaid alone. This is what makes a single formula correct for
 * cash, credit, and mixed purchases alike, with no special-casing.
 */
function cutFor(p: { amountPaid: number; creditApplied: number }, isFulfillment: boolean) {
  return computeScribeCut(effectivePrice(p), isFulfillment);
}

/**
 * CONFIRMED earnings only — independent of what's been withdrawn. A sale
 * doesn't count here until REFUND_WINDOW_MINUTES has passed since purchase
 * with no refund (plus a one-minute safety margin — see
 * EARNINGS_RELEASE_GRACE_MINUTES), AND it has no refund request waiting on
 * an admin. Until then it sits in getPendingEarnings() instead. This is
 * deliberately what backs withdrawal eligibility (via getAvailableBalance
 * below) — money a buyer can still get back isn't really "earned" yet.
 * Computed per-purchase, not as one `gross * SCRIBE_SHARE` aggregate — a
 * request-fulfillment sale earns a fixed ₦600 regardless of price, a
 * credit-redeemed sale earns its cut off the combined cash+credit price
 * (see effectivePrice in lib/pricing.ts) despite amountPaid alone possibly
 * being 0, and refunded purchases earn nothing at all — because under the
 * escrow model a refund can only ever be approved before a sale clears, so
 * a refunded purchase was never anyone's money to begin with.
 */
export async function getTotalEarnings(scribeId: string, db: Db = prisma): Promise<number> {
  const holdCutoff = new Date(Date.now() - EARNINGS_HOLD_MINUTES * 60 * 1000);

  const notes = await db.note.findMany({
    where: { scribeId },
    select: {
      fulfillsRequestId: true,
      purchases: {
        where: { refundedAt: null },
        select: { amountPaid: true, creditApplied: true, purchasedAt: true, reports: { where: { type: "REFUND" }, select: { status: true } } },
      },
    },
  });

  return notes.reduce(
    (sum, n) =>
      sum +
      n.purchases
        .filter((p) => saleStatus(p, holdCutoff) === "confirmed")
        .reduce((s, p) => s + cutFor(p, Boolean(n.fulfillsRequestId)), 0),
    0
  );
}

/**
 * The flip side of getTotalEarnings — real sales that haven't been
 * confirmed as the scribe's yet: still inside the refund-window
 * hold ("verifying"), or held because a buyer asked for a refund and an
 * admin still has to decide ("review").
 */
export async function getPendingEarnings(
  scribeId: string,
  db: Db = prisma
): Promise<{ amount: number; salesCount: number; reviewAmount: number; reviewSalesCount: number }> {
  const holdCutoff = new Date(Date.now() - EARNINGS_HOLD_MINUTES * 60 * 1000);

  const notes = await db.note.findMany({
    where: { scribeId },
    select: {
      fulfillsRequestId: true,
      purchases: {
        where: { refundedAt: null },
        select: {
          amountPaid: true,
          creditApplied: true,
          purchasedAt: true,
          reports: { where: { type: "REFUND" }, select: { status: true } },
        },
      },
    },
  });

  const acc = { amount: 0, salesCount: 0, reviewAmount: 0, reviewSalesCount: 0 };
  for (const n of notes) {
    for (const p of n.purchases) {
      const status = saleStatus(p, holdCutoff);
      if (status === "confirmed") continue;
      const cut = cutFor(p, Boolean(n.fulfillsRequestId));
      if (status === "refund_review") {
        acc.reviewAmount += cut;
        acc.reviewSalesCount += 1;
      } else {
        acc.amount += cut;
        acc.salesCount += 1;
      }
    }
  }
  return acc;
}

/**
 * Earnings minus anything already withdrawn or currently in flight — a
 * PENDING or PROCESSING payout reserves its amount so a scribe can't
 * request twice against the same money while the first request is still
 * being worked on. Only FAILED payouts release their reserved amount back.
 */
export async function getAvailableBalance(scribeId: string, db: Db = prisma): Promise<number> {
  const totalEarnings = await getTotalEarnings(scribeId, db);
  const reserved = await db.payout.aggregate({
    where: { scribeId, status: { in: ["PENDING", "PROCESSING", "PAID"] } },
    _sum: { amount: true },
  });

  return Math.max(0, totalEarnings - (reserved._sum.amount ?? 0));
}

function inWithdrawalWindow(date: Date): boolean {
  return date.getDate() <= WITHDRAWAL_WINDOW_DAY_END;
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export interface WithdrawalEligibility {
  eligible: boolean;
  reason?: string;
}

/** Checks the "once a month, only in the first week" rule (not the balance/amount itself). */
export async function checkWithdrawalWindow(scribeId: string, db: Db = prisma): Promise<WithdrawalEligibility> {
  const now = new Date();

  if (!inWithdrawalWindow(now)) {
    return { eligible: false, reason: "Withdrawals are only open during the first week of each month." };
  }

  const existingThisMonth = await db.payout.findFirst({
    where: { scribeId, requestedAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } },
  });

  if (existingThisMonth && isSameMonth(existingThisMonth.requestedAt, now)) {
    return { eligible: false, reason: "You've already requested a withdrawal this month." };
  }

  return { eligible: true };
}

export { MIN_WITHDRAWAL_AMOUNT };
