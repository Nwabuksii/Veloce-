import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
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

  const dbUser = await prisma.user.findUnique({ where: { id: user.sub } });
  if (!dbUser?.accountNumber || !dbUser.bankCode) {
    return NextResponse.json({ error: "Add your bank account details before requesting a withdrawal" }, { status: 400 });
  }

  const eligibility = await checkWithdrawalWindow(user.sub);
  if (!eligibility.eligible) {
    return NextResponse.json({ error: eligibility.reason }, { status: 409 });
  }

  if (parsed.data.amount < MIN_WITHDRAWAL_AMOUNT) {
    return NextResponse.json(
      { error: `Minimum withdrawal is ₦${MIN_WITHDRAWAL_AMOUNT.toLocaleString()}` },
      { status: 400 }
    );
  }

  const balance = await getAvailableBalance(user.sub);
  if (parsed.data.amount > balance) {
    return NextResponse.json({ error: "That's more than your available balance" }, { status: 400 });
  }

  const payout = await prisma.payout.create({
    data: { scribeId: user.sub, amount: parsed.data.amount },
  });

  return NextResponse.json({ payout });
});
