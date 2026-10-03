import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { checkCooldown, REAPPLY_COOLDOWN_DAYS } from "@/lib/scribe-lifecycle";

// Only a plain student may apply. Scribes and admins have nothing to apply
// for, and a demoted scribe goes through /api/scribe/appeal instead.
async function applyBlock(user: { sub: string; role: string }) {
  if (user.role !== "STUDENT") return { demoted: false };
  const u = await prisma.user.findUnique({ where: { id: user.sub }, select: { demotedAt: true } });
  return u?.demotedAt ? { demoted: true } : null;
}

// A user can have several applications over time (rejected, then reapplied
// weeks later), so this returns the most recent one plus whether they're
// currently allowed to submit another.
export const GET = requireRole("STUDENT", async (req: NextRequest, user) => {
  const blocked = await applyBlock(user);
  if (blocked) return NextResponse.json({ eligible: false, ...blocked, application: null, canApply: false, retryAt: null });

  const application = await prisma.scribeApplication.findFirst({
    where: { userId: user.sub, type: "APPLICATION" },
    orderBy: { submittedAt: "desc" },
  });

  const cooldown = await checkCooldown(user.sub, "APPLICATION");

  return NextResponse.json({
    eligible: true,
    application,
    canApply: cooldown.allowed,
    retryAt: cooldown.retryAt ?? null,
  });
});

const applySchema = z.object({
  reason: z.string().min(10, "Tell us a bit more — at least 10 characters").max(1000),
});

export const POST = requireRole("STUDENT", async (req: NextRequest, user) => {
  if (await applyBlock(user)) {
    return NextResponse.json({ error: "You can't apply to become a scribe." }, { status: 403 });
  }

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
