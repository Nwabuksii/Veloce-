import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { MAX_PINNED_BADGES } from "@/lib/badges";

interface RouteContext {
  params: { id: string };
}

// A scribe's badges. Anyone signed in sees the PINNED ones (their public
// profile); the scribe themselves gets the whole trophy case. Same visibility
// rules as the profile route: same university only, banned scribes hidden
// from everyone but admins.
export const GET = requireRole<RouteContext>("STUDENT", async (_req: NextRequest, viewer, ctx) => {
  const scribeId = ctx.params.id;
  const scribe = await prisma.user.findUnique({ where: { id: scribeId }, select: { universityId: true, bannedAt: true } });
  if (!scribe || scribe.universityId !== viewer.universityId || (scribe.bannedAt && viewer.role !== "ADMIN")) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const isSelf = viewer.sub === scribeId;
  const rows = await prisma.scribeBadge.findMany({
    where: { scribeId, ...(isSelf ? {} : { pinnedAt: { not: null } }) },
    select: { id: true, badgeKey: true, periodType: true, periodKey: true, awardedAt: true, pinnedAt: true },
    orderBy: { awardedAt: "desc" },
  });
  // Pinned first (in the order they were pinned), then the rest newest first.
  const pinned = rows.filter((r) => r.pinnedAt).sort((a, b) => a.pinnedAt!.getTime() - b.pinnedAt!.getTime());
  const rest = rows.filter((r) => !r.pinnedAt);

  return NextResponse.json({
    isSelf,
    maxPinned: MAX_PINNED_BADGES,
    badges: [...pinned, ...rest].map((r) => ({
      id: r.id,
      badgeKey: r.badgeKey,
      periodType: r.periodType,
      periodKey: r.periodKey,
      awardedAt: r.awardedAt,
      pinned: r.pinnedAt !== null,
    })),
  });
});
