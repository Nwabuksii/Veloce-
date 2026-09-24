import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

interface RouteContext {
  params: { id: string };
}

const voteSchema = z.object({ optionId: z.string().min(1) });

// One vote per poll per person, enforced by PollVote's @@unique([messageId,
// userId]) — a vote is final, not editable, once cast.
export const POST = requireRole<RouteContext>("STUDENT", async (req: NextRequest, user, ctx) => {
  const parsed = voteSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Pick an option" }, { status: 400 });
  }

  const message = await prisma.adminMessage.findUnique({
    where: { id: ctx.params.id },
    include: { pollOptions: true },
  });

  if (!message || message.recipientId !== user.sub || message.type !== "POLL") {
    return NextResponse.json({ error: "Poll not found" }, { status: 404 });
  }

  const option = message.pollOptions.find((o) => o.id === parsed.data.optionId);
  if (!option) {
    return NextResponse.json({ error: "That option isn't part of this poll" }, { status: 400 });
  }

  try {
    await prisma.$transaction([
      prisma.pollVote.create({
        data: { messageId: message.id, optionId: option.id, userId: user.sub },
      }),
      // Voting counts as reading it — relevant for the SERIOUS blocking
      // check, though polls block on an unvoted state regardless of
      // priority (see /api/messages/blocking).
      prisma.adminMessage.update({ where: { id: message.id }, data: { readAt: message.readAt ?? new Date() } }),
    ]);
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "You've already voted on this poll" }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json({ ok: true });
});
