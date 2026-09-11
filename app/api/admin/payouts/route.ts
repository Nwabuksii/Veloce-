import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const GET = requireRole("ADMIN", async (req: NextRequest, user) => {
  const payouts = await prisma.payout.findMany({
    where: { status: { in: ["PENDING", "PROCESSING"] }, scribe: { universityId: user.universityId } },
    include: {
      scribe: {
        select: { id: true, fullName: true, email: true, bankName: true, accountNumber: true, accountName: true },
      },
    },
    orderBy: { requestedAt: "asc" },
  });

  return NextResponse.json({ payouts });
});
