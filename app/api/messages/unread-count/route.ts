import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const GET = requireRole("STUDENT", async (req: NextRequest, user) => {
  const count = await prisma.adminMessage.count({
    where: { recipientId: user.sub, readAt: null },
  });

  return NextResponse.json({ count });
});
