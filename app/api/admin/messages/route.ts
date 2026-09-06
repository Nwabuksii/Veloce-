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
  recipientId: z.string().optional(),
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
    if (!parsed.data.recipientId) {
      return NextResponse.json({ error: "Pick a recipient" }, { status: 400 });
    }

    const recipient = await prisma.user.findUnique({ where: { id: parsed.data.recipientId } });
    if (!recipient) {
      return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
    }
    if (recipient.universityId !== adminUser.universityId) {
      return NextResponse.json({ error: "Cannot message users outside your university" }, { status: 403 });
    }

    const message = await prisma.adminMessage.create({
      data: { recipientId: recipient.id, senderId: adminUser.sub, subject, body },
    });

    return NextResponse.json({ sentCount: 1, message });
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
