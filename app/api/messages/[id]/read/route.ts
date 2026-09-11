import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

interface RouteContext {
  params: { id: string };
}

export const POST = requireRole<RouteContext>("STUDENT", async (req: NextRequest, user, ctx) => {
  const message = await prisma.adminMessage.findUnique({ where: { id: ctx.params.id } });

  if (!message || message.recipientId !== user.sub) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  if (!message.readAt) {
    await prisma.adminMessage.update({
      where: { id: message.id },
      data: { readAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
});
