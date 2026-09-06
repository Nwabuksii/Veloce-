import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { computeTrustLevel } from "@/lib/trust-level";

interface RouteContext {
  params: { id: string };
}

// Any authenticated user (student, scribe, or admin) can view a scribe's
// public profile — requireRole("STUDENT") is the lowest tier and lets
// everyone through per the Admin > Scribe > Student hierarchy.
export const GET = requireRole<RouteContext>(
  "STUDENT",
  async (req: NextRequest, viewer, ctx) => {
    const scribeId = ctx.params.id;

    const scribe = await prisma.user.findUnique({
      where: { id: scribeId },
      select: { id: true, fullName: true, role: true, createdAt: true },
    });

    if (!scribe) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const isActiveScribe = scribe.role === "SCRIBE" || scribe.role === "ADMIN";

    // A demoted former scribe still has real history (uploads, sales,
    // reviews) — only 404 for someone who was genuinely never a scribe.
    const everUploaded = await prisma.note.count({ where: { scribeId } });
    if (!isActiveScribe && everUploaded === 0) {
      return NextResponse.json({ error: "This user is not a scribe" }, { status: 404 });
    }

    const [purchases, reviews, rejectedCount, followerCount, myFollow, liveNotes] = await Promise.all([
      prisma.purchase.findMany({ where: { note: { scribeId } }, select: { buyerId: true } }),
      prisma.review.findMany({ where: { note: { scribeId } }, select: { rating: true } }),
      prisma.note.count({ where: { scribeId, status: "REJECTED" } }),
      prisma.follow.count({ where: { scribeId } }),
      prisma.follow.findUnique({
        where: { followerId_scribeId: { followerId: viewer.sub, scribeId } },
      }),
      prisma.note.findMany({
        where: { scribeId, status: { in: ["LIVE", "APPROVED"] } },
        include: { block: { include: { course: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const paidSubscriberCount = new Set(purchases.map((p) => p.buyerId)).size;
    const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;

    const trust = computeTrustLevel({
      salesCount: purchases.length,
      avgRating,
      hasRejectedNote: rejectedCount > 0,
    });

    return NextResponse.json({
      profile: {
        id: scribe.id,
        fullName: scribe.fullName,
        joinedAt: scribe.createdAt,
        isActiveScribe,
        paidSubscriberCount,
        followerCount,
        totalSales: purchases.length,
        avgRating,
        ratingCount: reviews.length,
        trustLevel: trust.level,
        trustLabel: trust.label,
        isFollowing: Boolean(myFollow),
        isSelf: viewer.sub === scribeId,
        blocks: liveNotes.map((n) => ({
          noteId: n.id,
          blockId: n.block.id,
          blockTitle: n.block.title,
          courseCode: n.block.course.code,
          courseName: n.block.course.name,
          price: n.block.price,
        })),
      },
    });
  }
);
