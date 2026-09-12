import { prisma } from "@/lib/prisma";
import type { TokenPayload } from "@/lib/auth";

// Same access rule the old raw-file route used: the note's own scribe, any
// admin, or someone who's actually purchased it.
export async function checkNoteAccess(user: TokenPayload, noteId: string) {
  const note = await prisma.note.findUnique({ where: { id: noteId } });
  if (!note) return { note: null, allowed: false };

  const isOwner = note.scribeId === user.sub;
  const isAdmin = user.role === "ADMIN";

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
