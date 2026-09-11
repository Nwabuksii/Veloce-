import { prisma } from "@/lib/prisma";
import { SCRIBE_SHARE, MIN_WITHDRAWAL_AMOUNT, WITHDRAWAL_WINDOW_DAY_END } from "@/lib/pricing";

/** Total ever earned (60% of gross), independent of what's been withdrawn. */
export async function getTotalEarnings(scribeId: string): Promise<number> {
  const notes = await prisma.note.findMany({
    where: { scribeId },
    include: { purchases: { select: { amountPaid: true } } },
  });

  const gross = notes.reduce((sum, n) => sum + n.purchases.reduce((s, p) => s + p.amountPaid, 0), 0);
  return Math.round(gross * SCRIBE_SHARE);
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
