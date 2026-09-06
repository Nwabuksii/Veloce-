import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword, signToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });

  // Same error for "no such user" and "wrong password" — don't reveal which one.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  // This is where role changes take effect: the token always reflects
  // the user's CURRENT role in the database, not a cached one.
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
