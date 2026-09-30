import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { archiveOldSecurityEvents } from "@/lib/security-archive";

const PAGE_SIZE = 30;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function dayStart(raw: string | null): Date | null {
  if (!raw || !DATE_RE.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const GET = requireRole("ADMIN", async (req: NextRequest, adminUser) => {
  const params = new URL(req.url).searchParams;
  const q = params.get("q")?.trim() || "";
  const event = params.get("event")?.trim() || "";
  const severity = params.get("severity")?.trim() || "";
  const from = dayStart(params.get("from"));
  const toDay = dayStart(params.get("to"));
  const cursor = params.get("cursor") || null;

  // First page of a visit: also start the monthly clear-out if a month has
  // ended (does nothing, cheaply, the rest of the time).
  if (!cursor) {
    await archiveOldSecurityEvents().catch((err) =>
      console.error("security log monthly clear failed", err instanceof Error ? err.message : "unknown")
    );
  }

  const where: any = { universityId: adminUser.universityId };
  if (event) where.event = event;
  if (severity) where.severity = severity;
  if (from || toDay) {
    where.createdAt = {
      ...(from ? { gte: from } : {}),
      ...(toDay ? { lt: new Date(toDay.getTime() + 24 * 60 * 60 * 1000) } : {}),
    };
  }

  // Search by name or email: find the matching people at this university
  // first, then filter the events to them.
  if (q) {
    const people = await prisma.user.findMany({
      where: {
        universityId: adminUser.universityId,
        OR: [
          { fullName: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true },
      take: 50,
    });
    where.userId = { in: people.map((p) => p.id) };
  }

  const rows = await prisma.securityEvent.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor } } : {}),
  });
  const nextCursor = rows.length > PAGE_SIZE ? rows[PAGE_SIZE].id : null;
  const page = rows.slice(0, PAGE_SIZE);

  const actorOf = (r: (typeof page)[number]) => {
    const d = (r.details ?? {}) as Record<string, unknown>;
    const id = d.byAdminId ?? d.adminId;
    return typeof id === "string" ? id : null;
  };
  const userIds = Array.from(
    new Set([...page.map((r) => r.userId), ...page.map(actorOf)].filter((v): v is string => !!v))
  );
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, email: true } })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  // Dropdown options come from what's actually recorded, so new event types
  // appear without a code change. Only sent with the first page.
  let filters: { events: string[]; severities: string[] } | undefined;
  if (!cursor) {
    const [events, severities] = await Promise.all([
      prisma.securityEvent.findMany({ where: { universityId: adminUser.universityId }, distinct: ["event"], select: { event: true }, orderBy: { event: "asc" } }),
      prisma.securityEvent.findMany({ where: { universityId: adminUser.universityId }, distinct: ["severity"], select: { severity: true }, orderBy: { severity: "asc" } }),
    ]);
    filters = { events: events.map((e) => e.event), severities: severities.map((s) => s.severity) };
  }

  return NextResponse.json({
    events: page.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      event: r.event,
      severity: r.severity,
      ip: r.ip,
      details: r.details,
      actor: (() => {
        const id = actorOf(r);
        return id ? userById.get(id)?.fullName ?? "Deleted account" : null;
      })(),
      user: r.userId ? userById.get(r.userId) ?? { id: r.userId, fullName: "Deleted account", email: "" } : null,
    })),
    nextCursor,
    filters,
  });
});
