import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { getFinanceData } from "@/lib/finance";

// Everything the plain ledger (/api/admin/finance) has, plus the escrow
// breakdown: money currently sitting as Credits Outstanding, Clearing
// (inside the refund window, about to become real revenue/earnings), and
// Refund Review (held on a pending refund request). See lib/finance.ts.
export const GET = requireRole("ADMIN", async (req: NextRequest, adminUser) => {
  const data = await getFinanceData(adminUser.universityId);
  return NextResponse.json(data);
});
