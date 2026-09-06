import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { APPEAL_COOLDOWN_DAYS } from "@/lib/scribe-lifecycle";

interface RouteContext {
  params: { id: string };
}

const demoteSchema = z.object({
  reason: z.string().max(1000).optional(),
});

export const POST = requireRole<RouteContext>("ADMIN", async (req: NextRequest, adminUser, ctx) => {
  const scribe = await prisma.user.findUnique({ where: { id: ctx.params.id } });

  if (!scribe) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (scribe.universityId !== adminUser.universityId) {
    return NextResponse.json({ error: "Cannot manage users outside your university" }, { status: 403 });
  }

  if (scribe.role !== "SCRIBE") {
    return NextResponse.json({ error: "This user is not currently an active scribe" }, { status: 409 });
  }

  // Best-effort parse — a reason is optional, so don't fail the demotion
  // over a malformed/empty body.
  let reason: string | undefined;
  try {
    const body = await req.json();
    const parsed = demoteSchema.safeParse(body);
    if (parsed.success) reason = parsed.data.reason;
  } catch {
    // no body sent — fine, reason stays undefined
  }

  const now = new Date();

  const updated = await prisma.user.update({
    where: { id: scribe.id },
    data: { role: "STUDENT", demotedAt: now },
  });

  await prisma.adminMessage.create({
    data: {
      recipientId: scribe.id,
      senderId: adminUser.sub,
      subject: "You've been removed as a Scribe",
      body: reason
        ? `An admin has removed your Scribe status. Reason given: "${reason}". You can submit one appeal per month if you'd like to request reinstatement.`
        : "An admin has removed your Scribe status. You can submit one appeal per month if you'd like to request reinstatement.",
    },
  });

  return NextResponse.json({
    user: { id: updated.id, fullName: updated.fullName, role: updated.role, demotedAt: updated.demotedAt },
    appealCooldownDays: APPEAL_COOLDOWN_DAYS,
  });
});
