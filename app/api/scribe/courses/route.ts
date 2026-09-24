import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

export const GET = requireRole("STUDENT", async (req: NextRequest, user) => {
  const courses = await prisma.course.findMany({
    where: { department: { universityId: user.universityId } },
    select: { id: true, name: true, code: true, departmentId: true, department: { select: { name: true } } },
    orderBy: { code: "asc" },
  });

  return NextResponse.json({
    courses: courses.map((course) => ({
      id: course.id,
      name: course.name,
      code: course.code,
      departmentId: course.departmentId,
      departmentName: course.department.name,
    })),
  });
});

const createCourseSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
  departmentId: z.string().min(1),
});

export const POST = requireRole("STUDENT", async (req: NextRequest, user) => {
  const body = await req.json();
  const parsed = createCourseSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const department = await prisma.department.findUnique({
    where: { id: parsed.data.departmentId },
  });

  if (!department || department.universityId !== user.universityId) {
    return NextResponse.json({ error: "Pick a valid department from your campus list" }, { status: 400 });
  }

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
