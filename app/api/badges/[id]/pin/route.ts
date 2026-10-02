import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { MAX_PINNED_BADGES } from "@/lib/badges";

interface RouteContext {
  params: { id: string };
}

class PinLimitError extends Error {}

// Pin or unpin one of your own badges: POST { pinned: true | false }.
// At most MAX_PINNED_BADGES (5) can be pinned at a time. Any role may pin —
// a graduated or former scribe keeps their badges and can still show them.
export const POST = requireRole<RouteContext>("STUDENT", async (req: NextRequest, user, ctx) => {
  const body = await req.json().catch(() => ({}));
  if (typeof body.pinned !== "boolean") {
    return NextResponse.json({ error: "Say whether to pin or unpin." }, { status: 400 });
  }

  // Someone else's badge looks exactly like a missing one.
  const badge = await prisma.scribeBadge.findUnique({ where: { id: ctx.params.id }, select: { scribeId: true, pinnedAt: true } });
  if (!badge || badge.scribeId !== user.sub) {
    return NextResponse.json({ error: "Badge not found" }, { status: 404 });
  }
  if (body.pinned === (badge.pinnedAt !== null)) return NextResponse.json({ pinned: body.pinned });

  try {
    await prisma.$transaction(
      async (tx) => {
        if (body.pinned) {
          const count = await tx.scribeBadge.count({ where: { scribeId: user.sub, pinnedAt: { not: null } } });
          if (count >= MAX_PINNED_BADGES) throw new PinLimitError();
        }
        await tx.scribeBadge.update({ where: { id: ctx.params.id }, data: { pinnedAt: body.pinned ? new Date() : null } });
      },
      // Serializable so two quick taps can't both slip past the limit.
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (err) {
    if (err instanceof PinLimitError) {
      return NextResponse.json({ error: `You can pin at most ${MAX_PINNED_BADGES} badges. Unpin one first.` }, { status: 409 });
    }
    if ((err as { code?: string })?.code === "P2034") {
      return NextResponse.json({ error: "Please try again." }, { status: 409 });
    }
    throw err;
  }
  return NextResponse.json({ pinned: body.pinned });
});
