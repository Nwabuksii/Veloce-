import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

interface RouteContext {
  params: { id: string };
}

// Rejecting leaves the user as STUDENT with demotedAt still set — they
// remain eligible to appeal again, just gated by the 30-day cooldown that
// checkCooldown computes from this row's reviewedAt.
export const POST = requireRole<RouteContext>("ADMIN", async (req: NextRequest, adminUser, ctx) => {
  const appeal = await prisma.scribeApplication.findUnique({
    where: { id: ctx.params.id },
    include: { user: true },
  });

  if (!appeal) {
    return NextResponse.json({ error: "Appeal not found" }, { status: 404 });
  }

  if (appeal.type !== "APPEAL") {
    return NextResponse.json({ error: "This is an application, not an appeal — use the scribe-applications endpoint" }, { status: 400 });
  }

  if (appeal.user.universityId !== adminUser.universityId) {
    return NextResponse.json({ error: "Cannot reject appeals outside your university" }, { status: 403 });
  }

  if (appeal.status !== "PENDING") {
    return NextResponse.json({ error: `Appeal already ${appeal.status.toLowerCase()}` }, { status: 409 });
  }

  const updatedAppeal = await prisma.scribeApplication.update({
    where: { id: appeal.id },
    data: { status: "REJECTED", reviewedAt: new Date(), reviewedById: adminUser.sub },
  });

  return NextResponse.json({ appeal: updatedAppeal });
});
