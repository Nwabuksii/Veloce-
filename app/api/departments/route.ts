import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

// Feeds the course/department picker (app/components/SearchableSelect) —
// only the requesting student's own university's departments, since a
// Babcock student has no business picking a department at another campus.
export const GET = requireRole("STUDENT", async (req: NextRequest, user) => {
  const departments = await prisma.department.findMany({
    where: { universityId: user.universityId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ departments });
});
