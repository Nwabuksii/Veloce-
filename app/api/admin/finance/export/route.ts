import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { rateLimitResponse } from "@/lib/rate-limit";
import { buildAdminReport } from "@/lib/export-finance";
import { todayStamp, workbookResponse } from "@/lib/xlsx-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HOUR = 60 * 60 * 1000;

// The admin's finance report as Excel: summary, monthly analysis, escrow,
// losses, sources, full ledger and charts. Covers the admin's OWN university
// only, same as every other finance route.
export const GET = requireRole("ADMIN", async (_req: NextRequest, admin) => {
  const blocked = await rateLimitResponse(`finance-export:${admin.sub}`, 10, HOUR, "Too many exports. Please try again later.");
  if (blocked) return blocked;

  const uni = await prisma.university.findUniqueOrThrow({ where: { id: admin.universityId }, select: { name: true } });
  const workbook = await buildAdminReport(admin.universityId, uni.name);
  return workbookResponse(workbook, `veloce-finance-${todayStamp()}.xlsx`);
});
