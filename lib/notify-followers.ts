import { prisma } from "@/lib/prisma";

// Fires from both places a note can actually reach LIVE status: a
// non-flagged upload (app/api/scribe/upload) and an admin approving a
// flagged/pending one (app/api/admin/notes/[id]/approve) — call this from
// both, never from anywhere a note merely gets *created* (still FLAGGED /
// PENDING_REVIEW isn't visible to anyone yet, so followers shouldn't hear
// about it until it actually is).
//
// Same in-app-only notification pattern already used for "your request
// was fulfilled" (see app/api/scribe/blocks) — one adminMessage per
// follower, no email. Deliberately silent (no throw) if there are no
// followers, so callers can fire-and-forget this without extra branching.
export async function notifyFollowersOfNewNote(scribeId: string, blockTitle: string) {
  const followers = await prisma.follow.findMany({
    where: { scribeId },
    select: { followerId: true },
  });
  if (followers.length === 0) return;

  const scribe = await prisma.user.findUnique({
    where: { id: scribeId },
    select: { fullName: true },
  });
  const scribeName = scribe?.fullName ?? "A scribe you follow";

  await prisma.adminMessage.createMany({
    data: followers.map((f) => ({
      recipientId: f.followerId,
      senderId: null,
      subject: `${scribeName} just published new notes`,
      body: `"${blockTitle}" is now live — you're getting this because you follow ${scribeName}. Head to their profile to check it out.`,
    })),
  });
}
