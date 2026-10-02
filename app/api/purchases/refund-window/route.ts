import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { NO_STORE } from "@/lib/cache-policy";
import { REFUND_WINDOW_MINUTES } from "@/lib/pricing";

// The caller's purchases that can still be refunded right now: inside the
// window, not refunded, no request already waiting. Soonest-to-close first.
// `serverNow` lets the browser count down against the server's clock.
export const GET = requireRole("STUDENT", async (_req: NextRequest, user) => {
  const cutoff = new Date(Date.now() - REFUND_WINDOW_MINUTES * 60_000);
  const rows = await prisma.purchase.findMany({
    where: {
      buyerId: user.sub,
      refundedAt: null,
      purchasedAt: { gte: cutoff },
      reports: { none: { type: "REFUND", status: "PENDING" } },
    },
    select: { id: true, noteId: true, purchasedAt: true, block: { select: { title: true } } },
    orderBy: { purchasedAt: "asc" },
  });

  return NextResponse.json(
    {
      windowMinutes: REFUND_WINDOW_MINUTES,
      serverNow: Date.now(),
      purchases: rows.map((p) => ({
        purchaseId: p.id,
        noteId: p.noteId,
        blockTitle: p.block.title,
        expiresAt: p.purchasedAt.getTime() + REFUND_WINDOW_MINUTES * 60_000,
      })),
    },
    { headers: { "Cache-Control": NO_STORE } }
  );
});
