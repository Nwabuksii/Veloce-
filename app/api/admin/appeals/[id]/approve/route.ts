import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendWelcomeMessage } from "@/lib/scribe-lifecycle";

interface RouteContext {
  params: { id: string };
}

// Approving an appeal reinstates the user as SCRIBE and clears demotedAt —
// a fresh demotion later would set it again and restart their appeal
// history from scratch (their old appeal rows stay, just no longer count
// toward any cooldown since checkCooldown only looks at the latest one).
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
    return NextResponse.json({ error: "Cannot approve appeals outside your university" }, { status: 403 });
  }

  if (appeal.status !== "PENDING") {
    return NextResponse.json({ error: `Appeal already ${appeal.status.toLowerCase()}` }, { status: 409 });
  }

  const [updatedAppeal] = await prisma.$transaction([
    prisma.scribeApplication.update({
      where: { id: appeal.id },
      data: { status: "APPROVED", reviewedAt: new Date(), reviewedById: adminUser.sub },
    }),
    prisma.user.update({
      where: { id: appeal.userId },
      data: { role: "SCRIBE", demotedAt: null },
    }),
  ]);

  await sendWelcomeMessage(appeal.userId, "scribe", adminUser.sub);

  return NextResponse.json({ appeal: updatedAppeal });
});
