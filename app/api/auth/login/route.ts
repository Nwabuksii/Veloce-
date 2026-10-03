import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword, signToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { checkAndResolveBan } from "@/lib/ban";
import { formatDateDDMMYYYY } from "@/lib/date-format";
import { checkRateLimit, ipKeyFrom } from "@/lib/rate-limit";
import { signMfaChallenge } from "@/lib/mfa";
import { logSecurityEvent, requestIp } from "@/lib/security-log";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string(),
  keepSignedIn: z.boolean().optional(),
});

// A real bcrypt hash of a throwaway string, made once per server instance.
// When the email doesn't exist we still run one bcrypt comparison against it,
// so "no such account" takes as long as "wrong password" instead of
// answering visibly faster (bcrypt is deliberately slow).
const dummyPasswordHash = hashPassword("veloce-not-a-real-password");

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export async function POST(req: NextRequest) {
  // Per-account lockout (below) stops one account being brute-forced, but
  // doesn't stop someone trying many different emails from one place —
  // this catches that. Generous limit since a whole campus can share one
  // public IP behind NAT.
  const allowed = await checkRateLimit(ipKeyFrom(req, "login"), 30, 15 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many login attempts from this network. Try again shortly." }, { status: 429 });
  }

  const body = await req.json();
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, password, keepSignedIn = true } = parsed.data;

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

  const passwordMatches = await verifyPassword(password, user?.passwordHash ?? (await dummyPasswordHash));
  const passwordOk = Boolean(user) && passwordMatches;

  // Same error for "no such user" and "wrong password" — don't reveal which one.
  if (!user || !passwordOk) {
    if (user) {
      // Atomic increment in the database — not "read the count, add one,
      // write it back", which lets parallel wrong-password attempts all read
      // the same starting value and undercount, sidestepping the lockout.
      const { failedLoginAttempts } = await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: { increment: 1 } },
        select: { failedLoginAttempts: true },
      });
      if (failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        await prisma.user.update({
          where: { id: user.id },
          data: { lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) },
        });
        await logSecurityEvent("login_locked", { userId: user.id, role: user.role, ip: requestIp(req) }, user.role === "ADMIN" ? "alert" : "warn");
      }
      // Failed logins against an admin account are the ones worth alerting
      // on; for everyone else it's a searchable log line. Only known
      // accounts are logged (by id) — an unknown email is not written down.
      await logSecurityEvent(user.role === "ADMIN" ? "admin_login_failed" : "login_failed", { userId: user.id, attempts: failedLoginAttempts, ip: requestIp(req) }, user.role === "ADMIN" ? "alert" : "info");
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

  // Two-factor: an admin who has turned it on doesn't get a session from a
  // correct password alone. They get a short-lived challenge instead, which
  // POST /api/auth/mfa/verify trades (with a code) for the real cookie.
  // Nothing is reset or recorded yet — failed attempts keep counting until
  // the second step succeeds.
  if (user.mfaEnabledAt) {
    return NextResponse.json({ mfaRequired: true, mfaToken: signMfaChallenge(user.id) }); // client re-sends keepSignedIn with the code
  }

  // Correct password — clear any accumulated failed attempts and record the
  // successful login so the admin monitoring view can show who has actually
  // used the platform.
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date(), lastSeenAt: new Date() },
  });

  // This is where role changes take effect: the token always reflects
  // the user's CURRENT role in the database, not a cached one.
  const token = signToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    universityId: user.universityId,
    sv: user.sessionVersion,
  }, keepSignedIn);

  const res = NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      theme: user.theme,
      avatarUrl: user.avatarUrl,
      avatarDisplay: user.avatarDisplay,
      departmentId: user.departmentId ?? null,
      level: user.level ?? null,
    },
  });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(undefined, keepSignedIn));
  return res;
}
