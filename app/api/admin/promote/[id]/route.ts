import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { sendWelcomeMessage } from "@/lib/scribe-lifecycle";

interface RouteContext {
  params: { id: string };
}

// There was previously no in-app way to promote someone to ADMIN — this
// fills that gap. Only an existing admin can do this, for their own
// university's users only.
export const POST = requireRole<RouteContext>("ADMIN", async (req: NextRequest, adminUser, ctx) => {
  const target = await prisma.user.findUnique({ where: { id: ctx.params.id } });

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (target.universityId !== adminUser.universityId) {
    return NextResponse.json({ error: "Cannot manage users outside your university" }, { status: 403 });
  }

  if (target.role === "ADMIN") {
    return NextResponse.json({ error: "This user is already an admin" }, { status: 409 });
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { role: "ADMIN" },
  });

  await sendWelcomeMessage(target.id, "admin", adminUser.sub);

  return NextResponse.json({
    user: { id: updated.id, fullName: updated.fullName, role: updated.role },
  });
});
