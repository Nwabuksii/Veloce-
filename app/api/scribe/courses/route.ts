import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const GET = requireRole("STUDENT", async (req: NextRequest, user) => {
  const courses = await prisma.course.findMany({
    where: { department: { universityId: user.universityId } },
    select: { id: true, name: true, code: true },
    orderBy: { code: "asc" },
  });

  return NextResponse.json({ courses });
});

const createCourseSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
});

export const POST = requireRole("STUDENT", async (req: NextRequest, user) => {
  const body = await req.json();
  const parsed = createCourseSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Department is kept invisible to scribes for now — everything lands under
  // a single "General" department per university under the hood.
  const department = await prisma.department.upsert({
    where: { universityId_name: { universityId: user.universityId, name: "General" } },
    update: {},
    create: { name: "General", universityId: user.universityId },
  });

  const existing = await prisma.course.findUnique({
    where: { departmentId_code: { departmentId: department.id, code: parsed.data.code } },
  });
  if (existing) {
    return NextResponse.json({ course: existing }); // reuse rather than duplicate
  }

  const course = await prisma.course.create({
    data: { name: parsed.data.name, code: parsed.data.code, departmentId: department.id },
  });

  return NextResponse.json({ course });
});
