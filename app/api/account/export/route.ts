import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { rateLimitResponse } from "@/lib/rate-limit";
import { buildPersonalExport } from "@/lib/export-personal";
import { todayStamp, workbookResponse } from "@/lib/xlsx-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const HOUR = 60 * 60 * 1000;

// "Download my data" — one Excel file, one sheet per table, and always the
// signed-in user's OWN rows (the id comes from the session, never from the
// request). One export per hour per account.
export const GET = requireRole("STUDENT", async (_req: NextRequest, user) => {
  const blocked = await rateLimitResponse(`export:${user.sub}`, 1, HOUR, "You can download your data once an hour. Please try again later.");
  if (blocked) return blocked;

  const { workbook, email } = await buildPersonalExport(user.sub);
  return workbookResponse(workbook, `veloce-data-${email}-${todayStamp()}.xlsx`);
});
