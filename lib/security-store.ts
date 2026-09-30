import { prisma } from "@/lib/prisma";
import { archiveOldSecurityEvents } from "@/lib/security-archive";

// Writes a security event to the database so it shows at /admin/security.
// logSecurityEvent (lib/security-log.ts) awaits this with the same fields it
// prints to the logs — the log line is still written; this is the permanent copy.
//
// Never throws: a failure to record history must not break a login, a ban
// or a payout.

// Rate-limit rejections have no user and would flood the table — they stay
// in the logs only.
const LOGS_ONLY = /rate[_-]?limit|too[_-]?many/i;
const NOT_DETAILS = new Set(["type", "event", "severity", "userId", "scribeId", "buyerId", "universityId", "ip", "ts", "time", "timestamp"]);

let lastMonthlyCheck = 0;

export async function persistSecurityEvent(entry: Record<string, unknown>): Promise<void> {
  try {
    const event = typeof entry.event === "string" ? entry.event : null;
    if (!event || LOGS_ONLY.test(event)) return;

    // Who the event is about. Login/ban/MFA events carry userId; payout and
    // refund events carry scribeId / buyerId; a payout check carries only the
    // admin who ran it. Picking the first one present lets the history page
    // filter by person and by university for every event type.
    const subject = ["userId", "scribeId", "buyerId", "adminId", "byAdminId"]
      .map((k) => entry[k])
      .find((v): v is string => typeof v === "string" && v.length > 0);
    const userId = subject ?? null;
    let universityId = typeof entry.universityId === "string" ? entry.universityId : null;
    if (!universityId && userId) {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { universityId: true } });
      universityId = u?.universityId ?? null;
    }

    const details: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(entry)) {
      if (NOT_DETAILS.has(k)) continue;
      if (typeof v === "string") details[k] = v.slice(0, 300);
      else if (typeof v === "number" || typeof v === "boolean") details[k] = v;
    }

    await prisma.securityEvent.create({
      data: {
        event: event.slice(0, 100),
        severity: typeof entry.severity === "string" ? entry.severity.slice(0, 20) : "info",
        userId,
        universityId,
        ip: typeof entry.ip === "string" ? entry.ip.slice(0, 64) : null,
        details: Object.keys(details).length ? details : undefined,
      },
    });

    // At most once an hour per server instance: start the monthly clear-out
    // if a month has ended. Cheap when there is nothing to do.
    if (Date.now() - lastMonthlyCheck > 60 * 60 * 1000) {
      lastMonthlyCheck = Date.now();
      await archiveOldSecurityEvents();
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("security history write/clear failed", err instanceof Error ? err.message : "unknown");
  }
}
