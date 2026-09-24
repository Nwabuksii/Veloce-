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

  const groups = new Map<
    string,
    { subject: string; body: string; type: string; priority: string; createdAt: Date; recipients: string[] }
  >();
  for (const m of messages) {
    const key = `${m.subject}|${m.body}|${m.createdAt.getTime()}`;
    if (!groups.has(key)) {
      groups.set(key, { subject: m.subject, body: m.body, type: m.type, priority: m.priority, createdAt: m.createdAt, recipients: [] });
    }
    groups.get(key)!.recipients.push(m.recipient.fullName);
  }

  const result = Array.from(groups.values())
    .slice(0, 30)
    .map((g) => ({
      subject: g.subject,
      body: g.body,
      type: g.type,
      priority: g.priority,
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

const sendSchema = z
  .object({
    audience: z.enum(["individual", "group"]),
    // Kept for compatibility with any existing caller sending one id; the
    // picker UI now always sends recipientIds (one or more). Either is
    // accepted and merged below.
    recipientId: z.string().optional(),
    recipientIds: z.array(z.string()).optional(),
    roles: z.array(roleEnum).optional(),
    subject: z.string().min(2).max(150),
    body: z.string().min(2).max(2000),
    type: z.enum(["TEXT", "POLL"]).default("TEXT"),
    priority: z.enum(["NORMAL", "SERIOUS"]).default("NORMAL"),
    // Required, at least 2, only when type === "POLL" — checked below
    // rather than as a discriminated union so the error message can be
    // specific ("polls need at least 2 options") instead of zod's generic
    // union mismatch text.
    pollOptions: z.array(z.string().min(1).max(120)).max(8).optional(),
  })
  .refine((data) => data.type !== "POLL" || (data.pollOptions && data.pollOptions.length >= 2), {
    message: "A poll needs at least 2 options",
    path: ["pollOptions"],
  });

async function resolveRecipients(
  adminUser: { sub: string; universityId: string },
  data: z.infer<typeof sendSchema>
): Promise<{ ids: string[] } | { error: string; status: number }> {
  if (data.audience === "individual") {
    const ids = Array.from(new Set([...(data.recipientId ? [data.recipientId] : []), ...(data.recipientIds ?? [])]));
    if (ids.length === 0) return { error: "Pick at least one recipient", status: 400 };

    const recipients = await prisma.user.findMany({ where: { id: { in: ids } } });
    if (recipients.length !== ids.length) return { error: "One of those recipients no longer exists", status: 404 };
    if (recipients.some((r) => r.universityId !== adminUser.universityId)) {
      return { error: "Cannot message users outside your university", status: 403 };
    }
    return { ids };
  }

  if (!data.roles || data.roles.length === 0) {
    return { error: "Select at least one audience group", status: 400 };
  }
  const recipients = await prisma.user.findMany({
    where: { universityId: adminUser.universityId, role: { in: data.roles }, id: { not: adminUser.sub } },
    select: { id: true },
  });
  if (recipients.length === 0) return { error: "No matching users to message", status: 404 };
  return { ids: recipients.map((r) => r.id) };
}

export const POST = requireRole("ADMIN", async (req: NextRequest, adminUser) => {
  const parsed = sendSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { subject, body, type, priority, pollOptions } = parsed.data;

  const resolved = await resolveRecipients(adminUser, parsed.data);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { ids } = resolved;
  const sentAt = new Date();

  if (type === "POLL") {
    // A poll's options (and later, its votes) are per-message, not shared
    // across recipients — see the schema comment on AdminMessage.pollOptions —
    // so each recipient needs their own AdminMessage row with its own
    // nested options, created individually rather than via createMany
    // (which can't do nested writes).
    await Promise.all(
      ids.map((recipientId) =>
        prisma.adminMessage.create({
          data: {
            recipientId,
            senderId: adminUser.sub,
            subject,
            body,
            type: "POLL",
            priority,
            createdAt: sentAt,
            pollOptions: { create: pollOptions!.map((label, i) => ({ label, order: i })) },
          },
        })
      )
    );
    return NextResponse.json({ sentCount: ids.length });
  }

  if (ids.length === 1) {
    const message = await prisma.adminMessage.create({
      data: { recipientId: ids[0], senderId: adminUser.sub, subject, body, priority },
    });
    return NextResponse.json({ sentCount: 1, message });
  }

  await prisma.adminMessage.createMany({
    data: ids.map((recipientId) => ({ recipientId, senderId: adminUser.sub, subject, body, priority, createdAt: sentAt })),
  });
  return NextResponse.json({ sentCount: ids.length });
});
