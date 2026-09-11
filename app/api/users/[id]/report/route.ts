import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

interface RouteContext {
  params: { id: string };
}

const reportSchema = z.object({
  reason: z.string().min(10, "Tell us a bit more — at least 10 characters").max(1000),
});

export const POST = requireRole<RouteContext>("STUDENT", async (req: NextRequest, user, ctx) => {
  const reportedUserId = ctx.params.id;

  if (reportedUserId === user.sub) {
    return NextResponse.json({ error: "You can't report yourself" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: reportedUserId } });

  if (!target || target.universityId !== user.universityId) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const parsed = reportSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const report = await prisma.report.create({
    data: {
      type: "USER",
      reporterId: user.sub,
      reportedUserId,
      reason: parsed.data.reason,
    },
  });

  return NextResponse.json({ report });
});
