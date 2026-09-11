import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { listBanks, resolveAccountNumber } from "@/lib/paystack";

export const GET = requireRole("SCRIBE", async (req: NextRequest, user) => {
  const [dbUser, banks] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.sub },
      select: { bankCode: true, bankName: true, accountNumber: true, accountName: true },
    }),
    listBanks(),
  ]);

  return NextResponse.json({ account: dbUser, banks });
});

const saveSchema = z.object({
  bankCode: z.string().min(1),
  accountNumber: z.string().min(10).max(10),
});

// Deliberately never accepts an accountName from the client — it always
// comes back from Paystack's own account-resolve call, so what's saved is
// guaranteed to be the real name on the account, not whatever someone typed.
export const PATCH = requireRole("SCRIBE", async (req: NextRequest, user) => {
  const parsed = saveSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const banks = await listBanks();
  const bank = banks.find((b) => b.code === parsed.data.bankCode);
  if (!bank) {
    return NextResponse.json({ error: "Unrecognized bank" }, { status: 400 });
  }

  let accountName: string;
  try {
    accountName = await resolveAccountNumber(parsed.data.accountNumber, parsed.data.bankCode);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Couldn't verify that account number" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: user.sub },
    data: {
      bankCode: parsed.data.bankCode,
      bankName: bank.name,
      accountNumber: parsed.data.accountNumber,
      accountName,
      payoutRecipientCode: null, // account changed — force re-registration with Paystack next payout
    },
    select: { bankCode: true, bankName: true, accountNumber: true, accountName: true },
  });

  return NextResponse.json({ account: updated });
});
