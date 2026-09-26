import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// Admin-only: everything pending review, both block reports and user
// reports together (sorted oldest first, same as the other review queues).
//
// Scoped by whoever OWNS the thing being reported, not by who filed the
// report — a report is only ever actionable by the admin with authority
// over the reported person/content, which since cross-university buying
// and interaction opened up is not necessarily the reporter's own admin.
// A USER report routes to the reported person's university; a BLOCK/note
// report (noteId set) routes to that note's scribe's university; a
// REFUND report always carries a noteId too (see
// app/api/purchases/[id]/refund-request/route.ts) so it routes the same
// way — refunds are a dispute about that specific note, decided by the
// admin who actually has standing over the scribe who wrote it. Only a
// generic BLOCK report with no specific note attached (see
// app/api/blocks/[id]/report/route.ts) has no single scribe to point at,
// so that one routes by the block's own university instead.
export const GET = requireRole("ADMIN", async (req: NextRequest, user) => {
  const reports = await prisma.report.findMany({
    where: {
      status: "PENDING",
      OR: [
        { type: "USER", reportedUser: { universityId: user.universityId } },
        { noteId: { not: null }, note: { scribe: { universityId: user.universityId } } },
        { type: "BLOCK", noteId: null, block: { course: { department: { universityId: user.universityId } } } },
      ],
    },
    include: {
      reporter: { select: { id: true, fullName: true, email: true } },
      block: { select: { id: true, title: true, course: { select: { code: true, name: true } } } },
      reportedUser: { select: { id: true, fullName: true, email: true, role: true } },
      note: { select: { id: true, scribe: { select: { id: true, fullName: true } } } },
      purchase: { select: { id: true, purchasedAt: true, amountPaid: true, creditApplied: true, refundedAt: true, redeemedWithCoupon: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ reports });
});
