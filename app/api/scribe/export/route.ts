import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { rateLimitResponse } from "@/lib/rate-limit";
import { buildScribeReport } from "@/lib/export-finance";
import { todayStamp, workbookResponse } from "@/lib/xlsx-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const HOUR = 60 * 60 * 1000;

// A scribe's own earnings + analytics as Excel (summary, by block, by note,
// monthly, payouts, charts). Built from the session's id only.
export const GET = requireRole("SCRIBE", async (_req: NextRequest, user) => {
  const blocked = await rateLimitResponse(`finance-export:${user.sub}`, 10, HOUR, "Too many exports. Please try again later.");
  if (blocked) return blocked;

  const me = await prisma.user.findUniqueOrThrow({ where: { id: user.sub }, select: { fullName: true } });
  const workbook = await buildScribeReport(user.sub, me.fullName);
  return workbookResponse(workbook, `veloce-earnings-${todayStamp()}.xlsx`);
});
