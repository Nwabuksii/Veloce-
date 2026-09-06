import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

interface RouteContext {
  params: { id: string };
}

export const POST = requireRole<RouteContext>(
  "STUDENT",
  async (req: NextRequest, user, ctx) => {
    const scribeId = ctx.params.id;

    if (scribeId === user.sub) {
      return NextResponse.json({ error: "You can't follow yourself" }, { status: 400 });
    }

    const scribe = await prisma.user.findUnique({ where: { id: scribeId }, select: { role: true } });
    if (!scribe || (scribe.role !== "SCRIBE" && scribe.role !== "ADMIN")) {
      return NextResponse.json({ error: "Scribe not found" }, { status: 404 });
    }

    const existing = await prisma.follow.findUnique({
      where: { followerId_scribeId: { followerId: user.sub, scribeId } },
    });

    if (existing) {
      await prisma.follow.delete({ where: { id: existing.id } });
    } else {
      await prisma.follow.create({ data: { followerId: user.sub, scribeId } });
    }

    const followerCount = await prisma.follow.count({ where: { scribeId } });

    return NextResponse.json({ following: !existing, followerCount });
  }
);
