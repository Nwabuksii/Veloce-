import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// Powers app/components/BlockingMessageModal — the global, non-dismissible
// gate. Two kinds of thing block the app until resolved:
//   - An unread SERIOUS-priority text message (any priority poll counts
//     too — see below — but a NORMAL text message never blocks).
//   - Any poll the person hasn't voted on yet, regardless of priority —
//     "pending Polls target-assigned to the user" blocks outright, voting
//     is what resolves it.
export const GET = requireRole("STUDENT", async (req: NextRequest, user) => {
  const messages = await prisma.adminMessage.findMany({
    where: {
      recipientId: user.sub,
      OR: [
        { type: "TEXT", priority: "SERIOUS", readAt: null },
        { type: "POLL", pollOptions: { none: { votes: { some: { userId: user.sub } } } } },
      ],
    },
    include: {
      sender: { select: { fullName: true } },
      pollOptions: { orderBy: { order: "asc" }, select: { id: true, label: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      subject: m.subject,
      body: m.body,
      senderName: m.sender?.fullName ?? "Veloce",
      type: m.type,
      priority: m.priority,
      options: m.type === "POLL" ? m.pollOptions : undefined,
    })),
  });
});
