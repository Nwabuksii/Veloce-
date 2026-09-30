import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { blockingMessageWhere } from "@/lib/blocking-messages";

export const DELETE = requireRole("STUDENT", async (_req: NextRequest, user, ctx: { params: { id: string } }) => {
  const message = await prisma.adminMessage.findUnique({
    where: { id: ctx.params.id },
    select: { id: true, recipientId: true },
  });

  if (!message || message.recipientId !== user.sub) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  // A message that is still blocking the app (unread SERIOUS message, or a
  // poll not yet voted on) can't be deleted — deleting it would make the
  // requirement vanish without the person ever acknowledging or voting.
  const stillBlocking = await prisma.adminMessage.count({
    where: { AND: [{ id: message.id }, blockingMessageWhere(user.sub)] },
  });
  if (stillBlocking > 0) {
    return NextResponse.json(
      { error: "This message needs your response first — open it and acknowledge it (or vote, for a poll) before deleting." },
      { status: 409 }
    );
  }

  await prisma.adminMessage.delete({ where: { id: message.id } });
  return NextResponse.json({ ok: true });
});
