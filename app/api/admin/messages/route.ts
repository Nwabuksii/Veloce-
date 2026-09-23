import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// Messages this admin has sent, grouped so a broadcast to 300 students
// shows as ONE entry with a recipient count — not 300 identical rows.
// Group sends share an exact createdAt timestamp (set explicitly below)
// specifically so they can be grouped back together here.
export const GET = requireRole("ADMIN", async (req: NextRequest, adminUser) => {
  const messages = await prisma.adminMessage.findMany({
    where: { senderId: adminUser.sub },
    include: { recipient: { select: { fullName: true } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  const groups = new Map<string, { subject: string; body: string; createdAt: Date; recipients: string[] }>();
  for (const m of messages) {
    const key = `${m.subject}|${m.body}|${m.createdAt.getTime()}`;
    if (!groups.has(key)) {
      groups.set(key, { subject: m.subject, body: m.body, createdAt: m.createdAt, recipients: [] });
    }
    groups.get(key)!.recipients.push(m.recipient.fullName);
  }

  const result = Array.from(groups.values())
    .slice(0, 30)
    .map((g) => ({
      subject: g.subject,
      body: g.body,
      createdAt: g.createdAt,
      recipientCount: g.recipients.length,
      recipientSummary:
        g.recipients.length <= 3
          ? g.recipients.join(", ")
          : `${g.recipients.slice(0, 2).join(", ")} and ${g.recipients.length - 2} other${g.recipients.length - 2 === 1 ? "" : "s"}`,
    }));

  return NextResponse.json({ messages: result });
});

const roleEnum = z.enum(["STUDENT", "SCRIBE", "ADMIN"]);

const sendSchema = z.object({
  audience: z.enum(["individual", "group"]),
  // Kept for compatibility with any existing caller sending one id; the
  // picker UI now always sends recipientIds (one or more). Either is
  // accepted and merged below.
  recipientId: z.string().optional(),
  recipientIds: z.array(z.string()).optional(),
  roles: z.array(roleEnum).optional(),
  subject: z.string().min(2).max(150),
  body: z.string().min(2).max(2000),
});

export const POST = requireRole("ADMIN", async (req: NextRequest, adminUser) => {
  const parsed = sendSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { audience, subject, body } = parsed.data;

  if (audience === "individual") {
    // De-duplicated union of the singular and plural fields, so a picker
    // with two, three, or a dozen people selected all go through one path.
    const ids = Array.from(new Set([...(parsed.data.recipientId ? [parsed.data.recipientId] : []), ...(parsed.data.recipientIds ?? [])]));

    if (ids.length === 0) {
      return NextResponse.json({ error: "Pick at least one recipient" }, { status: 400 });
    }

    const recipients = await prisma.user.findMany({ where: { id: { in: ids } } });
    if (recipients.length !== ids.length) {
      return NextResponse.json({ error: "One of those recipients no longer exists" }, { status: 404 });
    }
    if (recipients.some((r) => r.universityId !== adminUser.universityId)) {
      return NextResponse.json({ error: "Cannot message users outside your university" }, { status: 403 });
    }

    // Single recipient: return the created row, same shape callers already
    // expect. Multiple: share one createdAt so they group into one entry
    // in the "recently sent" list above, exactly like a role broadcast.
    if (recipients.length === 1) {
      const message = await prisma.adminMessage.create({
        data: { recipientId: recipients[0].id, senderId: adminUser.sub, subject, body },
      });
      return NextResponse.json({ sentCount: 1, message });
    }

    const sentAt = new Date();
    await prisma.adminMessage.createMany({
      data: recipients.map((r) => ({ recipientId: r.id, senderId: adminUser.sub, subject, body, createdAt: sentAt })),
    });
    return NextResponse.json({ sentCount: recipients.length });
  }

  // audience === "group" — fan out to everyone matching any checked role.
  if (!parsed.data.roles || parsed.data.roles.length === 0) {
    return NextResponse.json({ error: "Select at least one audience group" }, { status: 400 });
  }

  const recipients = await prisma.user.findMany({
    where: {
      universityId: adminUser.universityId,
      role: { in: parsed.data.roles },
      id: { not: adminUser.sub },
    },
    select: { id: true },
  });

  if (recipients.length === 0) {
    return NextResponse.json({ error: "No matching users to message" }, { status: 404 });
  }

  const sentAt = new Date();
  await prisma.adminMessage.createMany({
    data: recipients.map((r) => ({
      recipientId: r.id,
      senderId: adminUser.sub,
      subject,
      body,
      createdAt: sentAt,
    })),
  });

  return NextResponse.json({ sentCount: recipients.length });
});
