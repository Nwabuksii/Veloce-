import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { sendWelcomeMessage } from "@/lib/scribe-lifecycle";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().min(2),
  universitySlug: z.string(), // e.g. "babcock" — which campus they belong to
  departmentId: z.string().optional(),
  level: z.string().optional(), // e.g. "200L"
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = signupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, password, fullName, universitySlug, departmentId, level } = parsed.data;

  const university = await prisma.university.findUnique({ where: { slug: universitySlug } });
  if (!university) {
    return NextResponse.json({ error: "Unknown university" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName,
      universityId: university.id,
      departmentId,
      level,
      role: "STUDENT", // everyone starts as a Student; Scribe is an upgrade via application
    },
  });

  await sendWelcomeMessage(user.id, "student");

  const token = signToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    universityId: user.universityId,
  });

  const res = NextResponse.json({
    user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
  });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
