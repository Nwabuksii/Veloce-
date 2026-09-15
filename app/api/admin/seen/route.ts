import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const ALLOWED_SECTIONS = new Set(["feedback", "ledger"]);

// Admin-only: records that the current admin just opened a view-only
// section, so its hub badge can clear on the next counts fetch.
export const POST = requireRole("ADMIN", async (req: NextRequest, user) => {
  let body: { section?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const section = body.section;
  if (!section || !ALLOWED_SECTIONS.has(section)) {
    return NextResponse.json({ error: "Unknown section" }, { status: 400 });
  }

  await prisma.adminSectionView.upsert({
    where: {
      adminId_section: { adminId: user.id, section },
    },
    create: { adminId: user.id, section, lastSeenAt: new Date() },
    update: { lastSeenAt: new Date() },
  });

  return NextResponse.json({ ok: true });
});
