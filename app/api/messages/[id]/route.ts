import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const DELETE = requireRole("STUDENT", async (_req: NextRequest, user, ctx: { params: { id: string } }) => {
  const message = await prisma.adminMessage.findUnique({
    where: { id: ctx.params.id },
    select: { id: true, recipientId: true },
  });

  if (!message || message.recipientId !== user.sub) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  await prisma.adminMessage.delete({ where: { id: message.id } });
  return NextResponse.json({ ok: true });
});
