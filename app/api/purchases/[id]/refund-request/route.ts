import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { REFUND_WINDOW_MINUTES } from "@/lib/pricing";

interface RouteContext {
  params: { id: string };
}

const refundRequestSchema = z.object({
  reason: z.string().min(10, "Tell the admin a bit more — at least 10 characters.").max(1000),
});

export const POST = requireRole<RouteContext>("STUDENT", async (req: NextRequest, user, ctx) => {
  const purchaseId = ctx.params.id;

  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
  });

  if (!purchase || purchase.buyerId !== user.sub) {
    return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
  }

  if (purchase.refundedAt) {
    return NextResponse.json({ error: "This purchase has already been refunded" }, { status: 409 });
  }

  const minutesSincePurchase = (Date.now() - purchase.purchasedAt.getTime()) / 60000;
  if (minutesSincePurchase > REFUND_WINDOW_MINUTES) {
    return NextResponse.json(
      { error: `Refund requests are only available within ${REFUND_WINDOW_MINUTES} minutes of purchase.` },
      { status: 403 }
    );
  }

  const existingPending = await prisma.report.findFirst({
    where: { purchaseId: purchase.id, type: "REFUND", status: "PENDING" },
  });
  if (existingPending) {
    return NextResponse.json({ error: "You already have a pending refund request for this purchase" }, { status: 409 });
  }

  const parsed = refundRequestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const report = await prisma.report.create({
    data: {
      type: "REFUND",
      reporterId: user.sub,
      blockId: purchase.blockId,
      noteId: purchase.noteId,
      purchaseId: purchase.id,
      reason: parsed.data.reason,
    },
  });

  return NextResponse.json({ report: { id: report.id, status: report.status } });
});
