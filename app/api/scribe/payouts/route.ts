import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { logSecurityEvent } from "@/lib/security-log";
import { getAvailableBalance, checkWithdrawalWindow, MIN_WITHDRAWAL_AMOUNT } from "@/lib/withdrawal";

export const GET = requireRole("SCRIBE", async (req: NextRequest, user) => {
  const [balance, eligibility, payouts] = await Promise.all([
    getAvailableBalance(user.sub),
    checkWithdrawalWindow(user.sub),
    prisma.payout.findMany({ where: { scribeId: user.sub }, orderBy: { requestedAt: "desc" } }),
  ]);

  return NextResponse.json({ balance, eligibility, payouts });
});

const requestSchema = z.object({
  amount: z.number().int().positive(),
});

export const POST = requireRole("SCRIBE", async (req: NextRequest, user) => {
  const parsed = requestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.amount < MIN_WITHDRAWAL_AMOUNT) {
    return NextResponse.json(
      { error: `Minimum withdrawal is ₦${MIN_WITHDRAWAL_AMOUNT.toLocaleString()}` },
      { status: 400 }
    );
  }

  // The "is there enough balance / has a request already been made this
  // month" checks and the insert that spends that balance are ONE
  // transaction, serialized per scribe by a row lock. Before, they were
  // separate steps, so several parallel requests could each pass the check
  // against the same balance and then each create a payout for it.
  const outcome = await prisma.$transaction(
    async (tx) => {
      // Any other payout request from this scribe waits here until this
      // transaction commits, then sees the payout created below when it
      // recomputes the balance. Other scribes are unaffected.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.sub} FOR UPDATE`;

      const dbUser = await tx.user.findUnique({
        where: { id: user.sub },
        select: { accountNumber: true, bankCode: true },
      });
      if (!dbUser?.accountNumber || !dbUser.bankCode) {
        return { error: "Add your bank account details before requesting a withdrawal", status: 400 } as const;
      }

      const eligibility = await checkWithdrawalWindow(user.sub, tx);
      if (!eligibility.eligible) {
        return { error: eligibility.reason ?? "Withdrawals are not available right now", status: 409 } as const;
      }

      const balance = await getAvailableBalance(user.sub, tx);
      if (parsed.data.amount > balance) {
        return { error: "That's more than your available balance", status: 400 } as const;
      }

      const payout = await tx.payout.create({
        data: { scribeId: user.sub, amount: parsed.data.amount },
      });
      return { payout } as const;
    },
    { maxWait: 10_000, timeout: 20_000 }
  );

  if ("error" in outcome) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }
  await logSecurityEvent("payout_requested", { payoutId: outcome.payout.id, scribeId: user.sub, amount: outcome.payout.amount });
  return NextResponse.json({ payout: outcome.payout });
});
