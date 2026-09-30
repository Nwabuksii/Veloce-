import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

// Monthly clear-out of the security history. Any month that has finished
// is emailed to the site email (the same EMAIL_SENDER_ADDRESS every other
// email is sent from) as a CSV, and only then deleted. If the email fails
// nothing is deleted and the next run tries again — history is never
// dropped without a copy having been sent.
//
// There is no scheduler: it runs the first time anything touches the
// security log in a new month (see lib/security-store.ts and
// app/api/admin/security/route.ts), so it needs no extra setup.

const LOCK_ID = "archive";
const LOCK_MS = 10 * 60 * 1000;
const PAGE = 2000;
const MAX_PART_BYTES = 3 * 1024 * 1024; // Brevo caps attachments around 4 MB
const CSV_HEADER = "time (UTC),event,severity,user id,user email,university id,ip,details\n";

function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  // Leading = + - @ would be run as a formula if the CSV is opened in Excel.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

async function claimLock(now: Date): Promise<boolean> {
  await prisma.securityLogLock.upsert({
    where: { id: LOCK_ID },
    create: { id: LOCK_ID, lockedUntil: new Date(0) },
    update: {},
  });
  const claimed = await prisma.securityLogLock.updateMany({
    where: { id: LOCK_ID, lockedUntil: { lt: now } },
    data: { lockedUntil: new Date(now.getTime() + LOCK_MS) },
  });
  return claimed.count === 1;
}

async function releaseLock(): Promise<void> {
  await prisma.securityLogLock.update({ where: { id: LOCK_ID }, data: { lockedUntil: new Date(0) } }).catch(() => undefined);
}

async function emailAndClearMonth(start: Date, end: Date): Promise<number> {
  const where = { createdAt: { gte: start, lt: end } };
  const total = await prisma.securityEvent.count({ where });
  if (total === 0) return 0;

  const bySeverity: Record<string, number> = {};
  const byEvent: Record<string, number> = {};
  const parts: string[] = [];
  let current = CSV_HEADER;
  let cursor: string | undefined;

  for (;;) {
    const rows = await prisma.securityEvent.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (rows.length === 0) break;

    const userIds = Array.from(new Set(rows.map((r) => r.userId).filter((v): v is string => !!v)));
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } })
      : [];
    const emailById = new Map(users.map((u) => [u.id, u.email]));

    for (const r of rows) {
      bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1;
      byEvent[r.event] = (byEvent[r.event] ?? 0) + 1;
      const line =
        [
          r.createdAt.toISOString(),
          r.event,
          r.severity,
          r.userId,
          r.userId ? emailById.get(r.userId) ?? "(deleted account)" : "",
          r.universityId,
          r.ip,
          r.details ? JSON.stringify(r.details) : "",
        ]
          .map(csvCell)
          .join(",") + "\n";
      if (Buffer.byteLength(current) + Buffer.byteLength(line) > MAX_PART_BYTES) {
        parts.push(current);
        current = CSV_HEADER;
      }
      current += line;
    }
    cursor = rows[rows.length - 1].id;
    if (rows.length < PAGE) break;
  }
  parts.push(current);

  const label = start.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const key = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  const summary = [
    `Security log for ${label}: ${total} event(s). The full list is attached as CSV.`,
    "",
    "By severity:",
    ...Object.entries(bySeverity).map(([k, v]) => `  ${k}: ${v}`),
    "",
    "By event:",
    ...Object.entries(byEvent)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `  ${k}: ${v}`),
    "",
    "These events have now been cleared from /admin/security.",
  ].join("\n");

  for (let i = 0; i < parts.length; i++) {
    const suffix = parts.length > 1 ? ` (part ${i + 1} of ${parts.length})` : "";
    await sendEmail({
      to: process.env.EMAIL_SENDER_ADDRESS!,
      subject: `Veloce security log — ${label}${suffix}`,
      text: summary,
      attachments: [
        {
          filename: `veloce-security-${key}${parts.length > 1 ? `-part${i + 1}` : ""}.csv`,
          content: Buffer.from(parts[i], "utf8"),
          mimetype: "text/csv",
        },
      ],
    });
  }

  // Only reached once every email above was accepted.
  await prisma.securityEvent.deleteMany({ where });
  return total;
}

export async function archiveOldSecurityEvents(now: Date = new Date()): Promise<number> {
  const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const oldest = await prisma.securityEvent.findFirst({
    where: { createdAt: { lt: thisMonth } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  if (!oldest) return 0;
  if (!(await claimLock(now))) return 0;

  try {
    let cleared = 0;
    let start = new Date(Date.UTC(oldest.createdAt.getUTCFullYear(), oldest.createdAt.getUTCMonth(), 1));
    while (start < thisMonth) {
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
      cleared += await emailAndClearMonth(start, end);
      start = end;
    }
    return cleared;
  } finally {
    await releaseLock();
  }
}
