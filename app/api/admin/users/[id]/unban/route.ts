import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendUnbanEmail } from "@/lib/ban";

interface RouteContext {
  params: { id: string };
}

export const POST = requireRole<RouteContext>("ADMIN", async (req: NextRequest, adminUser, ctx) => {
  const target = await prisma.user.findUnique({ where: { id: ctx.params.id } });

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (target.universityId !== adminUser.universityId) {
    return NextResponse.json({ error: "Cannot manage users outside your university" }, { status: 403 });
  }
  if (!target.bannedAt) {
    return NextResponse.json({ error: "This user isn't banned" }, { status: 409 });
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { bannedAt: null, banReason: null, banExpiresAt: null, bannedById: null },
  });

  try {
    await sendUnbanEmail({ email: target.email, fullName: target.fullName });
  } catch (err) {
    console.error("Failed to send unban email:", err);
  }

  return NextResponse.json({ user: { id: updated.id, fullName: updated.fullName } });
});
