import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { computeScribeCut } from "@/lib/pricing";

interface RouteContext {
  params: { id: string };
}

// The single action behind "admin selects refund": revokes the buyer's
// access to the note, reverses whatever the scribe was credited for this
// sale (it simply drops out of every earnings calculation from here on,
// since lib/withdrawal.ts, the admin finance route, and the scribe
// earnings route all filter on `refundedAt: null`), grants the buyer one
// coupon, resolves any pending refund report(s) on this purchase, and
// messages both people involved.
export const POST = requireRole<RouteContext>("ADMIN", async (req: NextRequest, adminUser, ctx) => {
  const purchaseId = ctx.params.id;

  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      buyer: true,
      note: { include: { scribe: true } },
      block: { select: { title: true } },
    },
  });

  if (!purchase) {
    return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
  }

  if (purchase.buyer.universityId !== adminUser.universityId) {
    return NextResponse.json({ error: "Cannot manage purchases outside your university" }, { status: 403 });
  }

  if (purchase.refundedAt) {
    return NextResponse.json({ error: "This purchase has already been refunded" }, { status: 409 });
  }

  const lostCut = purchase.redeemedWithCoupon
    ? purchase.scribeCutOverride ?? 0
    : computeScribeCut(purchase.amountPaid, Boolean(purchase.note.fulfillsRequestId));

  const pendingReports = await prisma.report.findMany({
    where: { purchaseId: purchase.id, type: "REFUND", status: "PENDING" },
  });

  const now = new Date();

  await prisma.$transaction([
    prisma.purchase.update({
      where: { id: purchase.id },
      data: { refundedAt: now },
    }),
    prisma.user.update({
      where: { id: purchase.buyerId },
      data: { couponBalance: { increment: 1 } },
    }),
    ...(pendingReports.length > 0
      ? [
          prisma.report.updateMany({
            where: { id: { in: pendingReports.map((r) => r.id) } },
            data: { status: "ACTIONED", reviewedAt: now, reviewedById: adminUser.sub },
          }),
        ]
      : []),
    prisma.adminMessage.create({
      data: {
        recipientId: purchase.buyerId,
        senderId: adminUser.sub,
        subject: `Refund processed — "${purchase.block.title}"`,
        body: `Your purchase of "${purchase.block.title}" was refunded and you no longer have access to it. As an apology for the trouble, you've been given 1 coupon — it'll be used automatically on your next purchase, no charge.`,
      },
    }),
    prisma.adminMessage.create({
      data: {
        recipientId: purchase.note.scribeId,
        senderId: adminUser.sub,
        subject: `A sale of "${purchase.block.title}" was refunded`,
        body: `An admin refunded a buyer's purchase of your version of "${purchase.block.title}". ₦${lostCut.toLocaleString()} has been reversed from your earnings for this sale.`,
      },
    }),
  ]);

  return NextResponse.json({
    purchase: { id: purchase.id, refunded: true },
    scribeCutReversed: lostCut,
    reportsResolved: pendingReports.length,
  });
});
