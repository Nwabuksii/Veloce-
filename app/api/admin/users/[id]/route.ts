import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { isUserOnline } from "@/lib/online";

interface RouteContext {
  params: { id: string };
}

export const GET = requireRole<RouteContext>("ADMIN", async (req: NextRequest, adminUser, ctx) => {
  const user = await prisma.user.findUnique({
    where: { id: ctx.params.id },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      departmentId: true,
      department: { select: { name: true } },
      level: true,
      createdAt: true,
      lastLoginAt: true,
      lastSeenAt: true,
      bannedAt: true,
      banReason: true,
      banExpiresAt: true,
      notes: {
        select: {
          id: true,
          fileUrl: true,
          status: true,
          createdAt: true,
          block: { select: { title: true, course: { select: { code: true } } } },
        },
      },
      purchases: {
        select: {
          id: true,
          amountPaid: true,
          purchasedAt: true,
          refundedAt: true,
          block: { select: { title: true, course: { select: { code: true, name: true } } } },
          noteId: true,
          review: { select: { rating: true } },
        },
      },
      requestVotes: {
        select: {
          id: true,
          request: {
            select: {
              id: true,
              requestedTitle: true,
              createdAt: true,
              status: true,
              block: { select: { title: true } },
              votes: { select: { id: true } },
            },
          },
        },
      },
      following: {
        select: {
          id: true,
          scribe: { select: { id: true, fullName: true, role: true } },
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { universityId: true } });
  if (!dbUser || dbUser.universityId !== adminUser.universityId) {
    return NextResponse.json({ error: "Cannot inspect users outside your university" }, { status: 403 });
  }

  const requests = user.requestVotes.map((vote) => ({
    id: vote.request.id,
    requestedTitle: vote.request.requestedTitle,
    createdAt: vote.request.createdAt,
    status: vote.request.status,
    voteCount: vote.request.votes.length,
    blockTitle: vote.request.block?.title ?? null,
  }));

  const purchases = user.purchases.map((purchase) => ({
    id: purchase.id,
    title: purchase.block.title,
    courseCode: purchase.block.course.code,
    courseName: purchase.block.course.name,
    amountPaid: purchase.amountPaid,
    purchasedAt: purchase.purchasedAt,
    refundedAt: purchase.refundedAt,
    reviewRating: purchase.review?.rating ?? null,
    noteId: purchase.noteId,
  }));

  const notes = user.notes.map((note) => ({
    id: note.id,
    title: note.block.title,
    status: note.status,
    createdAt: note.createdAt,
    blockTitle: note.block.title,
    courseCode: note.block.course.code,
  }));

  const following = user.following.map((entry) => ({
    id: entry.scribe.id,
    fullName: entry.scribe.fullName,
    role: entry.scribe.role,
  }));

  return NextResponse.json({
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      departmentName: user.department?.name ?? null,
      level: user.level,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      lastSeenAt: user.lastSeenAt,
      isOnline: isUserOnline(user.lastSeenAt),
      bannedAt: user.bannedAt,
      banReason: user.banReason,
      banExpiresAt: user.banExpiresAt,
      noteCount: user.notes.length,
      purchaseCount: user.purchases.length,
      requestCount: user.requestVotes.length,
      followingCount: user.following.length,
      reportCount: 0,
      purchases,
      requests,
      notes,
      following,
    },
  });
});
