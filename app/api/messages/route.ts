import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const GET = requireRole("STUDENT", async (req: NextRequest, user) => {
  const messages = await prisma.adminMessage.findMany({
    where: { recipientId: user.sub },
    include: { sender: { select: { fullName: true } } },
    orderBy: { createdAt: "desc" },
  });

  const result = messages.map((m) => ({
    id: m.id,
    subject: m.subject,
    body: m.body,
    senderName: m.sender?.fullName ?? "Veloce",
    readAt: m.readAt,
    createdAt: m.createdAt,
  }));

  return NextResponse.json({ messages: result });
});
