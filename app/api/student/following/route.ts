import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { computeTrustLevel } from "@/lib/trust-level";

export const GET = requireRole("STUDENT", async (req: NextRequest, user) => {
  const follows = await prisma.follow.findMany({
    where: { followerId: user.sub },
    include: { scribe: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: "desc" },
  });

  const scribeIds = follows.map((f) => f.scribeId);
  const [purchaseCounts, reviews, rejectedNotes] = await Promise.all([
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

  const scribes = follows.map((f) => {
    const overall = ratingsByScribe.get(f.scribeId);
    const trust = computeTrustLevel({
      salesCount: salesByScribe.get(f.scribeId) ?? 0,
      avgRating: overall ? overall.sum / overall.count : null,
      hasRejectedNote: rejectedScribeIds.has(f.scribeId),
    });

    return {
      id: f.scribe.id,
      fullName: f.scribe.fullName,
      trustLevel: trust.level,
      trustLabel: trust.label,
      followedAt: f.createdAt,
    };
  });

  return NextResponse.json({ scribes });
});
