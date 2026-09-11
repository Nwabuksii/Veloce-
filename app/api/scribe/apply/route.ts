import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { checkCooldown, REAPPLY_COOLDOWN_DAYS } from "@/lib/scribe-lifecycle";

// A user can have several applications over time (rejected, then reapplied
// weeks later), so this returns the most recent one plus whether they're
// currently allowed to submit another.
export const GET = requireRole("STUDENT", async (req: NextRequest, user) => {
  const application = await prisma.scribeApplication.findFirst({
    where: { userId: user.sub, type: "APPLICATION" },
    orderBy: { submittedAt: "desc" },
  });

  const cooldown = await checkCooldown(user.sub, "APPLICATION");

  return NextResponse.json({
    application,
    canApply: cooldown.allowed,
    retryAt: cooldown.retryAt ?? null,
  });
});

const applySchema = z.object({
  reason: z.string().min(10, "Tell us a bit more — at least 10 characters").max(1000),
});

export const POST = requireRole("STUDENT", async (req: NextRequest, user) => {
  const parsed = applySchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const cooldown = await checkCooldown(user.sub, "APPLICATION");

  if (!cooldown.allowed) {
    return NextResponse.json(
      {
        error: cooldown.reason,
        retryAt: cooldown.retryAt ?? null,
        cooldownDays: REAPPLY_COOLDOWN_DAYS,
      },
      { status: 409 }
    );
  }

  const application = await prisma.scribeApplication.create({
    data: { userId: user.sub, type: "APPLICATION", reason: parsed.data.reason, status: "PENDING" },
  });

  return NextResponse.json({ application });
});
