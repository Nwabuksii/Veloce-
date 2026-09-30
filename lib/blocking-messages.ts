import type { Prisma } from "@prisma/client";

/**
 * The single definition of "this message is blocking the person right now":
 *   - an unread SERIOUS-priority text message, or
 *   - a poll they haven't voted on yet (any priority).
 * Used both by GET /api/messages/blocking (what to show in the gate) and by
 * DELETE /api/messages/[id] (what may NOT be deleted yet) — sharing it means
 * the two can never drift apart and leave a deletable way around the gate.
 */
export function blockingMessageWhere(userId: string): Prisma.AdminMessageWhereInput {
  return {
    recipientId: userId,
    OR: [
      { type: "TEXT", priority: "SERIOUS", readAt: null },
      { type: "POLL", pollOptions: { none: { votes: { some: { userId } } } } },
    ],
  };
}
