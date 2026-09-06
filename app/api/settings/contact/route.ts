import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// Returns an admin's email for this user's own university so the Settings
// page's "Contact admin" button can build a real mailto: link, instead of
// hardcoding one support address for every university on the platform.
export const GET = requireRole("STUDENT", async (req: NextRequest, user) => {
  const admin = await prisma.user.findFirst({
    where: { universityId: user.universityId, role: "ADMIN" },
    select: { email: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ adminEmail: admin?.email ?? null });
});
