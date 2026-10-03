import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

interface RouteContext {
  params: { id: string };
}

// Puts a flagged block (POTENTIAL_MALICIOUS or ADMIN_REVIEW) back to NORMAL
// so it returns to the catalog. The status is recomputed from reports each
// time a new report comes in (lib/block-moderation.ts), so a new report that
// pushes the buyer ratio back over a threshold will flag it again.
export const POST = requireRole<RouteContext>("ADMIN", async (_req: NextRequest, adminUser, ctx) => {
  const block = await prisma.block.findUnique({
    where: { id: ctx.params.id },
    select: { id: true, moderationStatus: true, course: { select: { department: { select: { universityId: true } } } } },
  });

  if (!block || block.course.department.universityId !== adminUser.universityId) {
    return NextResponse.json({ error: "Block not found" }, { status: 404 });
  }

  if (block.moderationStatus === "NORMAL") {
    return NextResponse.json({ error: "This block isn't flagged" }, { status: 409 });
  }

  await prisma.block.update({
    where: { id: block.id },
    data: { moderationStatus: "NORMAL" },
  });

  return NextResponse.json({ ok: true, moderationStatus: "NORMAL" });
});
