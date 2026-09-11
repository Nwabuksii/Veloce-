import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword, signToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { checkAndResolveBan } from "@/lib/ban";
import { formatDateDDMMYYYY } from "@/lib/date-format";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });

  // Locked accounts are rejected before even checking the password — a
  // correct password shouldn't un-stick a lockout early, since that would
  // let an attacker use a correct-password response as a signal that
  // they'd found the right one mid-lockout.
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return NextResponse.json(
      { error: `Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.` },
      { status: 429 }
    );
  }

  const passwordOk = user ? await verifyPassword(password, user.passwordHash) : false;

  // Same error for "no such user" and "wrong password" — don't reveal which one.
  if (!user || !passwordOk) {
    if (user) {
      const attempts = user.failedLoginAttempts + 1;
      const data: { failedLoginAttempts: number; lockedUntil?: Date } = { failedLoginAttempts: attempts };
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        data.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
      }
      await prisma.user.update({ where: { id: user.id }, data });
    }
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  if (!user.emailVerifiedAt) {
    return NextResponse.json(
      { error: "Please verify your email before logging in.", needsVerification: true },
      { status: 403 }
    );
  }

  // Checked here too (not just requireRole) so a banned person gets a
  // clear, specific message right at login instead of a confusing error
  // on their first click after getting in. Also where a timed ban that's
  // already run out gets lifted and the "suspension ended" email sent.
  const banStatus = await checkAndResolveBan(user.id);
  if (banStatus.banned) {
    const untilText = banStatus.until ? `until ${formatDateDDMMYYYY(banStatus.until)}` : "until further notice";
    const reasonText = banStatus.reason ? ` Reason given: "${banStatus.reason}".` : "";
    return NextResponse.json(
      { error: `Your account is suspended ${untilText}.${reasonText}`, banned: true },
      { status: 403 }
    );
  }

  // Correct password — clear any accumulated failed attempts.
  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
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
