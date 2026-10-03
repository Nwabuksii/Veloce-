import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Runs on the 1st of every month (see vercel.json). Vercel calls it with
//   Authorization: Bearer <CRON_SECRET>
// and nothing else may.
//
// It sends a short "your report is ready" email — NO figures and NO
// attachment, so no financial numbers sit in anyone's mailbox. The report
// itself is the Export button on the Earnings / Finance page, behind login.
//
// Scribes are emailed only if they had a sale last month; every admin is.

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function secretMatches(header: string | null, secret: string): boolean {
  const a = Buffer.from(header ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function sendReportEmail(to: string, name: string, monthName: string, path: string, where: string) {
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}${path}`;
  const text = [
    `Hi ${name},`,
    ``,
    `Your Veloce financial report for ${monthName} is ready.`,
    `Log in, open ${where} and press "Export to Excel": ${url}`,
    ``,
    `For your security the report is not attached to this email.`,
  ].join("\n");
  const html = `<p>Hi ${esc(name)},</p>
<p>Your Veloce financial report for <strong>${esc(monthName)}</strong> is ready.</p>
<p>Log in, open <strong>${esc(where)}</strong> and press <strong>Export to Excel</strong>, or <a href="${url}">go straight there</a>.</p>
<p>For your security the report is not attached to this email.</p>`;
  await sendEmail({ to, subject: `Your Veloce report for ${monthName} is ready`, text, html });
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  if (!secretMatches(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthName = start.toLocaleString("en-GB", { month: "long", year: "numeric" });

  // Vercel can fire a cron twice. One run per month; ?force=1 re-runs on purpose.
  const force = req.nextUrl.searchParams.get("force") === "1";
  if (!force && !(await checkRateLimit(`monthly-reports:${start.getFullYear()}-${start.getMonth()}`, 1, 20 * 24 * 60 * 60 * 1000))) {
    return NextResponse.json({ skipped: "Already ran for " + monthName });
  }

  const sold = await prisma.purchase.findMany({
    where: { purchasedAt: { gte: start, lt: end }, refundedAt: null },
    select: { note: { select: { scribeId: true } } },
  });
  const scribeIds = [...new Set(sold.map((p) => p.note.scribeId))];

  const eligible = { bannedAt: null, emailVerifiedAt: { not: null } };
  const [scribes, admins] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: scribeIds }, role: "SCRIBE", ...eligible }, select: { email: true, fullName: true } }),
    prisma.user.findMany({ where: { role: "ADMIN", ...eligible }, select: { email: true, fullName: true } }),
  ]);

  const jobs = [
    ...scribes.map((u) => () => sendReportEmail(u.email, u.fullName, monthName, "/scribe/earnings", "Earnings")),
    ...admins.map((u) => () => sendReportEmail(u.email, u.fullName, monthName, "/admin/finance", "Financial")),
  ];

  // Ten at a time so a long list can't outrun the function's time limit.
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < jobs.length; i += 10) {
    const results = await Promise.allSettled(jobs.slice(i, i + 10).map((run) => run()));
    for (const r of results) r.status === "fulfilled" ? sent++ : failed++;
  }

  return NextResponse.json({ month: monthName, scribes: scribes.length, admins: admins.length, sent, failed });
}
