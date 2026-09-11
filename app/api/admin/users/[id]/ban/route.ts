import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendBanEmail } from "@/lib/ban";

interface RouteContext {
  params: { id: string };
}

const banSchema = z
  .object({
    reason: z.string().max(500).optional(),
    // Either a specific calendar date, or a number of days from now — omit
    // both for "until further notice". If both are somehow sent, the date
    // wins since it's the more explicit/intentional of the two.
    until: z.string().datetime().optional(),
    durationDays: z.number().int().positive().optional(),
  })
  .refine((data) => !data.until || new Date(data.until) > new Date(), {
    message: "Ban-until date must be in the future",
    path: ["until"],
  });

export const POST = requireRole<RouteContext>("ADMIN", async (req: NextRequest, adminUser, ctx) => {
  const target = await prisma.user.findUnique({ where: { id: ctx.params.id } });

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (target.universityId !== adminUser.universityId) {
    return NextResponse.json({ error: "Cannot manage users outside your university" }, { status: 403 });
  }
  if (target.id === adminUser.sub) {
    return NextResponse.json({ error: "You can't ban your own account" }, { status: 400 });
  }
  if (target.bannedAt) {
    return NextResponse.json({ error: "This user is already banned" }, { status: 409 });
  }

  const parsed = banSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const until = parsed.data.until
    ? new Date(parsed.data.until)
    : parsed.data.durationDays
      ? new Date(Date.now() + parsed.data.durationDays * 24 * 60 * 60 * 1000)
      : null;

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: {
      bannedAt: new Date(),
      banReason: parsed.data.reason ?? null,
      banExpiresAt: until,
      bannedById: adminUser.sub,
    },
  });

  // Best-effort — the ban itself is already applied regardless of whether
  // the notification email succeeds.
  try {
    await sendBanEmail({
      userId: target.id,
      email: target.email,
      fullName: target.fullName,
      universityId: target.universityId,
      reason: parsed.data.reason,
      until,
    });
  } catch (err) {
    console.error("Failed to send ban email:", err);
  }

  return NextResponse.json({
    user: { id: updated.id, fullName: updated.fullName, bannedAt: updated.bannedAt, banExpiresAt: updated.banExpiresAt },
  });
});
