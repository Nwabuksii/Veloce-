import { prisma } from "@/lib/prisma";
import { computeScribeCut, MIN_WITHDRAWAL_AMOUNT, WITHDRAWAL_WINDOW_DAY_END, REFUND_WINDOW_MINUTES } from "@/lib/pricing";

function cutFor(p: { amountPaid: number; redeemedWithCoupon: boolean; scribeCutOverride: number | null }, isFulfillment: boolean) {
  return p.redeemedWithCoupon ? p.scribeCutOverride ?? 0 : computeScribeCut(p.amountPaid, isFulfillment);
}

/**
 * CONFIRMED earnings only — independent of what's been withdrawn. A sale
 * doesn't count here until REFUND_WINDOW_MINUTES has passed since purchase
 * with no refund; until then it sits in getPendingEarnings() instead. This
 * is deliberately what backs withdrawal eligibility (via
 * getAvailableBalance below) — money a buyer can still get back isn't
 * really "earned" yet. Computed per-purchase, not as one
 * `gross * SCRIBE_SHARE` aggregate — a request-fulfillment sale earns a
 * fixed ₦600 regardless of amountPaid, a coupon-redeemed sale earns its
 * scribeCutOverride despite amountPaid being 0, and refunded purchases
 * earn nothing at all (that's the mechanism behind "the scribe loses his
 * ₦600" on a refund — the purchase simply drops out of every earnings
 * calculation once refunded).
 */
export async function getTotalEarnings(scribeId: string): Promise<number> {
  const holdCutoff = new Date(Date.now() - REFUND_WINDOW_MINUTES * 60 * 1000);

  const notes = await prisma.note.findMany({
    where: { scribeId },
    select: {
      fulfillsRequestId: true,
      purchases: {
        where: { refundedAt: null, purchasedAt: { lte: holdCutoff } },
        select: { amountPaid: true, redeemedWithCoupon: true, scribeCutOverride: true },
      },
    },
  });

  return notes.reduce(
    (sum, n) => sum + n.purchases.reduce((s, p) => s + cutFor(p, Boolean(n.fulfillsRequestId)), 0),
    0
  );
}

/**
 * The flip side of getTotalEarnings — sales still inside the
 * REFUND_WINDOW_MINUTES hold, unrefunded so far. Shown to the scribe as
 * "pending" / "verifying" money: real sales that happened, just not
 * confirmed as theirs to withdraw yet, since the buyer could still ask
 * for a refund on them.
 */
export async function getPendingEarnings(scribeId: string): Promise<{ amount: number; salesCount: number }> {
  const holdCutoff = new Date(Date.now() - REFUND_WINDOW_MINUTES * 60 * 1000);

  const notes = await prisma.note.findMany({
    where: { scribeId },
    select: {
      fulfillsRequestId: true,
      purchases: {
        where: { refundedAt: null, purchasedAt: { gt: holdCutoff } },
        select: { amountPaid: true, redeemedWithCoupon: true, scribeCutOverride: true },
      },
    },
  });

  return notes.reduce(
    (acc, n) => {
      for (const p of n.purchases) {
        acc.amount += cutFor(p, Boolean(n.fulfillsRequestId));
        acc.salesCount += 1;
      }
      return acc;
    },
    { amount: 0, salesCount: 0 }
  );
}

/**
 * Earnings minus anything already withdrawn or currently in flight — a
 * PENDING or PROCESSING payout reserves its amount so a scribe can't
 * request twice against the same money while the first request is still
 * being worked on. Only FAILED payouts release their reserved amount back.
 */
export async function getAvailableBalance(scribeId: string): Promise<number> {
  const [totalEarnings, reserved] = await Promise.all([
    getTotalEarnings(scribeId),
    prisma.payout.aggregate({
      where: { scribeId, status: { in: ["PENDING", "PROCESSING", "PAID"] } },
      _sum: { amount: true },
    }),
  ]);

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
export async function checkWithdrawalWindow(scribeId: string): Promise<WithdrawalEligibility> {
  const now = new Date();

  if (!inWithdrawalWindow(now)) {
    return { eligible: false, reason: "Withdrawals are only open during the first week of each month." };
  }

  const existingThisMonth = await prisma.payout.findFirst({
    where: { scribeId, requestedAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } },
  });

  if (existingThisMonth && isSameMonth(existingThisMonth.requestedAt, now)) {
    return { eligible: false, reason: "You've already requested a withdrawal this month." };
  }

  return { eligible: true };
}

export { MIN_WITHDRAWAL_AMOUNT };
