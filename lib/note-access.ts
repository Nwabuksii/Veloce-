import { prisma } from "@/lib/prisma";
import type { TokenPayload } from "@/lib/auth";

// Same access rule the old raw-file route used: the note's own scribe, any
// admin AT THE SAME UNIVERSITY, or someone who's actually purchased it.
// The university check matters just as much here as it does for every
// other admin data route (see e.g. the ban route's own universityId
// check) — without it, an admin at University B could pull the full,
// watermarked content of a University A note just by knowing its id,
// completely bypassing the per-university isolation the rest of the
// admin surface relies on.
// Marks "the buyer actually started reading this" the first time only. The
// WHERE (buyerId + firstOpenedAt: null) makes later calls a no-op, and it only
// matches a real purchase row, so the scribe or an admin previewing a note
// (no Purchase row) never sets it. Called from every route the reader uses
// (/pages, /all-pages, /page/[num]) so a real read always counts. Powers the
// "not opened yet" nudge in Purchases and the leaderboard "reads" points.
export async function markNoteOpened(userId: string, noteId: string) {
  await prisma.purchase.updateMany({
    where: { buyerId: userId, noteId, refundedAt: null, firstOpenedAt: null },
    data: { firstOpenedAt: new Date() },
  });
}

export async function checkNoteAccess(user: TokenPayload, noteId: string) {
  const note = await prisma.note.findUnique({
    where: { id: noteId },
    include: { scribe: { select: { universityId: true } } },
  });
  if (!note) return { note: null, allowed: false };

  const isOwner = note.scribeId === user.sub;
  const isAdmin = user.role === "ADMIN" && note.scribe.universityId === user.universityId;

  const allowed =
    isOwner || isAdmin
      ? true
      : Boolean(
          await prisma.purchase.findFirst({
            where: { buyerId: user.sub, noteId: note.id, refundedAt: null },
          })
        );

  return { note, allowed };
}
