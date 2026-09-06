import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

interface RouteContext {
  params: { id: string };
}

const rejectSchema = z.object({
  reason: z.string().max(500).optional(),
});

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

  if (payout.status !== "PENDING") {
    return NextResponse.json({ error: `Payout already ${payout.status.toLowerCase()}` }, { status: 409 });
  }

  let reason: string | undefined;
  try {
    const body = await req.json();
    const parsed = rejectSchema.safeParse(body);
    if (parsed.success) reason = parsed.data.reason;
  } catch {
    // no body sent — fine
  }

  const updated = await prisma.payout.update({
    where: { id: payout.id },
    data: {
      status: "FAILED",
      processedAt: new Date(),
      processedById: adminUser.sub,
      failureReason: reason ?? "Rejected by admin",
    },
  });

  // No money ever moved for this one, so it doesn't count against the
  // scribe's balance anymore — reflected automatically since
  // getAvailableBalance only reserves PENDING/PROCESSING/PAID payouts.
  return NextResponse.json({ payout: updated });
});
