import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { LEVELS } from "@/lib/academic";

const schema = z.object({
  departmentId: z.string().min(1),
  level: z.enum(LEVELS),
});

// The save endpoint behind the onboarding modal (app/components/
// AcademicProfileModal) — separate from the general PATCH /api/account
// since this isn't a security-sensitive identity change (no current
// password needed) and always sets both fields together, never one alone,
// so a student can never end up with a level but no department or vice
// versa.
export const PATCH = requireRole("STUDENT", async (req: NextRequest, user) => {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const department = await prisma.department.findUnique({ where: { id: parsed.data.departmentId } });
  if (!department || department.universityId !== user.universityId) {
    return NextResponse.json({ error: "Pick a department from the list" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: user.sub },
    data: { departmentId: department.id, level: parsed.data.level },
    select: { departmentId: true, level: true },
  });

  return NextResponse.json({ departmentId: updated.departmentId, level: updated.level });
});
