import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { computeTrustLevel } from "@/lib/trust-level";

// Lets a student search for a scribe by name to follow — same trust-level
// computation as everywhere else this shows up (block pages, the scribe's
// own profile), so the badge here always matches what they'd see if they
// clicked through.
export const GET = requireRole("STUDENT", async (req: NextRequest, user) => {
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";

  if (q.length < 2) {
    return NextResponse.json({ scribes: [] });
  }

  const scribes = await prisma.user.findMany({
    where: {
      universityId: user.universityId,
      role: { in: ["SCRIBE", "ADMIN"] },
      fullName: { contains: q, mode: "insensitive" },
      bannedAt: null, // banned accounts shouldn't be discoverable to follow at all
    },
    select: { id: true, fullName: true },
    take: 20,
  });

  const scribeIds = scribes.map((s) => s.id);
  const [purchaseCounts, reviews, rejectedNotes, myFollows] = await Promise.all([
    prisma.purchase.findMany({
      where: { note: { scribeId: { in: scribeIds } } },
      select: { note: { select: { scribeId: true } } },
    }),
    prisma.review.findMany({
      where: { note: { scribeId: { in: scribeIds } } },
      select: { rating: true, note: { select: { scribeId: true } } },
    }),
    prisma.note.findMany({
      where: { scribeId: { in: scribeIds }, status: "REJECTED" },
      select: { scribeId: true },
    }),
    prisma.follow.findMany({
      where: { followerId: user.sub, scribeId: { in: scribeIds } },
      select: { scribeId: true },
    }),
  ]);

  const salesByScribe = new Map<string, number>();
  for (const p of purchaseCounts) {
    salesByScribe.set(p.note.scribeId, (salesByScribe.get(p.note.scribeId) ?? 0) + 1);
  }
  const ratingsByScribe = new Map<string, { sum: number; count: number }>();
  for (const r of reviews) {
    const cur = ratingsByScribe.get(r.note.scribeId) ?? { sum: 0, count: 0 };
    cur.sum += r.rating;
    cur.count += 1;
    ratingsByScribe.set(r.note.scribeId, cur);
  }
  const rejectedScribeIds = new Set(rejectedNotes.map((n) => n.scribeId));
  const followingIds = new Set(myFollows.map((f) => f.scribeId));

  const result = scribes.map((s) => {
    const overall = ratingsByScribe.get(s.id);
    const trust = computeTrustLevel({
      salesCount: salesByScribe.get(s.id) ?? 0,
      avgRating: overall ? overall.sum / overall.count : null,
      hasRejectedNote: rejectedScribeIds.has(s.id),
    });

    return {
      id: s.id,
      fullName: s.fullName,
      trustLevel: trust.level,
      trustLabel: trust.label,
      isFollowing: followingIds.has(s.id),
    };
  });

  return NextResponse.json({ scribes: result });
});
