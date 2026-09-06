import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { checkCooldown, APPEAL_COOLDOWN_DAYS } from "@/lib/scribe-lifecycle";

// Appeals are only for users who've actually been demoted (role fell back
// to STUDENT and demotedAt got set). A student who was never a scribe
// should use /api/scribe/apply instead.
export const GET = requireRole("STUDENT", async (req: NextRequest, user) => {
  const dbUser = await prisma.user.findUnique({ where: { id: user.sub } });

  if (!dbUser?.demotedAt) {
    return NextResponse.json({ eligible: false, appeal: null, canAppeal: false });
  }

  const appeal = await prisma.scribeApplication.findFirst({
    where: { userId: user.sub, type: "APPEAL" },
    orderBy: { submittedAt: "desc" },
  });

  const cooldown = await checkCooldown(user.sub, "APPEAL");

  return NextResponse.json({
    eligible: true,
    demotedAt: dbUser.demotedAt,
    appeal,
    canAppeal: cooldown.allowed,
    retryAt: cooldown.retryAt ?? null,
  });
});

const appealSchema = z.object({
  reason: z.string().min(10, "Tell us a bit more — at least 10 characters").max(1000),
});

export const POST = requireRole("STUDENT", async (req: NextRequest, user) => {
  const dbUser = await prisma.user.findUnique({ where: { id: user.sub } });

  if (!dbUser?.demotedAt) {
    return NextResponse.json(
      { error: "Only users demoted from Scribe can submit an appeal" },
      { status: 403 }
    );
  }

  const parsed = appealSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const cooldown = await checkCooldown(user.sub, "APPEAL");

  if (!cooldown.allowed) {
    return NextResponse.json(
      {
        error: cooldown.reason,
        retryAt: cooldown.retryAt ?? null,
        cooldownDays: APPEAL_COOLDOWN_DAYS,
      },
      { status: 409 }
    );
  }

  const appeal = await prisma.scribeApplication.create({
    data: { userId: user.sub, type: "APPEAL", reason: parsed.data.reason, status: "PENDING" },
  });

  return NextResponse.json({ appeal });
});
