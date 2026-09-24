import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const GET = requireRole("STUDENT", async (req: NextRequest, user) => {
  const messages = await prisma.adminMessage.findMany({
    where: { recipientId: user.sub },
    include: {
      sender: { select: { fullName: true } },
      pollOptions: {
        orderBy: { order: "asc" },
        include: { votes: { select: { userId: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const result = messages.map((m) => {
    const totalVotes = m.pollOptions.reduce((sum, o) => sum + o.votes.length, 0);
    const myVote = m.pollOptions.find((o) => o.votes.some((v) => v.userId === user.sub));

    return {
      id: m.id,
      subject: m.subject,
      body: m.body,
      senderName: m.sender?.fullName ?? "Veloce",
      readAt: m.readAt,
      createdAt: m.createdAt,
      type: m.type,
      priority: m.priority,
      poll:
        m.type === "POLL"
          ? {
              myOptionId: myVote?.id ?? null,
              totalVotes,
              options: m.pollOptions.map((o) => ({ id: o.id, label: o.label, votes: o.votes.length })),
            }
          : null,
    };
  });

  return NextResponse.json({ messages: result });
});
