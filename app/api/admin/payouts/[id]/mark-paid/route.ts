import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

interface RouteContext {
  params: { id: string };
}

// Manual-mode only — the admin has actually sent the money themselves
// (their own banking app, or Paystack's dashboard directly) and is
// confirming it here. In automated mode this step doesn't exist; the
// webhook (see /api/webhooks/paystack) does this automatically instead.
export const POST = requireRole<RouteContext>("ADMIN", async (req: NextRequest, adminUser, ctx) => {
  const payout = await prisma.payout.findUnique({
    where: { id: ctx.params.id },
    include: { scribe: true },
  });

  if (!payout) {
    return NextResponse.json({ error: "Payout request not found" }, { status: 404 });
  }

  if (payout.scribe.universityId !== adminUser.universityId) {
    return NextResponse.json({ error: "Cannot manage payouts outside your university" }, { status: 403 });
  }

  if (payout.status !== "PROCESSING") {
    return NextResponse.json(
      { error: "Only a payout you've already approved can be marked as paid" },
      { status: 409 }
    );
  }

  const updated = await prisma.payout.update({
    where: { id: payout.id },
    data: { status: "PAID", paidAt: new Date() },
  });

  return NextResponse.json({ payout: updated });
});
