import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { getFinanceData } from "@/lib/finance";
import { NO_STORE } from "@/lib/cache-policy";

// The plain ledger — deliberately just the headline numbers and the recent
// transaction feed, no escrow breakdown. See /api/admin/finance/advanced
// for the fuller picture (credits, clearing, refund review), reached from
// a button on this page rather than shown here, so this one stays simple.
export const GET = requireRole("ADMIN", async (req: NextRequest, adminUser) => {
  const data = await getFinanceData(adminUser.universityId);

  const response = NextResponse.json({
    grossRevenue: data.grossRevenue,
    platformRevenue: data.platformRevenue,
    scribePool: data.scribePool,
    transactionCount: data.transactionCount,
    scribeSharePercent: data.scribeSharePercent,
    platformSharePercent: data.platformSharePercent,
    creditIssued: data.creditIssued,
    creditRedeemed: data.creditRedeemed,
    creditOutstanding: data.creditOutstanding,
    recentTransactions: data.recentTransactions,
  });

  // Financial data: never cached (it used to be kept for 60s, plus 180s
  // stale, in the browser and any shared cache).
  response.headers.set("Cache-Control", NO_STORE);
  return response;
});
