import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { getFinanceAnalysis } from "@/lib/finance-analysis";
import { NO_STORE } from "@/lib/cache-policy";

// Monthly revenue analysis: trends, pipeline, losses, forecast and sources.
export const GET = requireRole("ADMIN", async (_req: NextRequest, adminUser) => {
  const data = await getFinanceAnalysis(adminUser.universityId);
  const res = NextResponse.json(data);
  res.headers.set("Cache-Control", NO_STORE);
  return res;
});
