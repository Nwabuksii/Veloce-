import { prisma } from "@/lib/prisma";

// Tells the students who voted for a request that notes now exist for it.
// Called from the one place a note becomes LIVE (lib/render-queue.ts), NOT
// when the block is created — at that point nothing is buyable yet.
// Sent once per request: only for the first LIVE note that fulfils it.
// ponytail: check-then-send isn't atomic, so two notes going LIVE in the
// same instant could notify twice; add a notifiedAt column if that ever shows up.
export async function notifyRequestersNoteLive(noteId: string) {
  const note = await prisma.note.findUnique({
    where: { id: noteId },
    select: {
      fulfillsRequestId: true,
      block: { select: { id: true, title: true, course: { select: { code: true } } } },
      fulfillsRequest: { select: { requestedTitle: true } },
    },
  });
  if (!note?.fulfillsRequestId) return;

  const otherLive = await prisma.note.count({
    where: { fulfillsRequestId: note.fulfillsRequestId, status: "LIVE", id: { not: noteId } },
  });
  if (otherLive > 0) return;

  const voters = await prisma.requestVote.findMany({
    where: { requestId: note.fulfillsRequestId },
    select: { studentId: true },
  });
  if (voters.length === 0) return;

  await prisma.adminMessage.createMany({
    data: voters.map((v) => ({
      recipientId: v.studentId,
      senderId: null,
      subject: `Your request was fulfilled — "${note.block.title}"`,
      body: `Good news — "${note.fulfillsRequest?.requestedTitle ?? note.block.title}" for ${note.block.course.code} now has notes available: "${note.block.title}". Head to the block to check it out.`,
    })),
  });
}
