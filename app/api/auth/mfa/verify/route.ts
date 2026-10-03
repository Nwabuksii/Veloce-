import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { signToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { checkAndResolveBan } from "@/lib/ban";
import { formatDateDDMMYYYY } from "@/lib/date-format";
import { checkRateLimit, ipKeyFrom } from "@/lib/rate-limit";
import { verifyMfaChallenge } from "@/lib/mfa";
import { consumeMfaCode } from "@/lib/mfa-check";
import { logSecurityEvent, requestIp } from "@/lib/security-log";

// Second step of login for an account with two-factor on. The password was
// already accepted by /api/auth/login, which handed back `mfaToken`; this
// trades that plus a 6-digit authenticator code (or one recovery code) for
// the real session cookie.

const verifySchema = z.object({
  mfaToken: z.string().min(1),
  code: z.string().min(1).max(32),
  keepSignedIn: z.boolean().optional(),
});

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  const parsed = verifySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter your verification code" }, { status: 400 });
  }

  // Per network first (cheap, no database), then per account below.
  if (!(await checkRateLimit(ipKeyFrom(req, "mfa-verify"), 30, WINDOW_MS))) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  const userId = verifyMfaChallenge(parsed.data.mfaToken);
  if (!userId) {
    return NextResponse.json({ error: "That sign-in expired. Please log in again.", restart: true }, { status: 401 });
  }

  // A six-digit code has only a million possibilities, so guesses are
  // counted per account, not just per address. Once spent, even the right
  // code is refused until the window passes.
  if (!(await checkRateLimit(`mfa-verify-user:${userId}`, MAX_ATTEMPTS, WINDOW_MS))) {
    await logSecurityEvent("mfa_failed", { userId, reason: "rate_limited", ip: requestIp(req) }, "alert");
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and log in again." }, { status: 429 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.mfaEnabledAt || !user.mfaSecret) {
    return NextResponse.json({ error: "That sign-in expired. Please log in again.", restart: true }, { status: 401 });
  }

  const banStatus = await checkAndResolveBan(user.id);
  if (banStatus.banned) {
    const untilText = banStatus.until ? `until ${formatDateDDMMYYYY(banStatus.until)}` : "until further notice";
    return NextResponse.json({ error: `Your account is suspended ${untilText}.`, banned: true }, { status: 403 });
  }

  const { ok: accepted, usedRecoveryCode } = await consumeMfaCode(user, parsed.data.code);

  if (!accepted) {
    await logSecurityEvent("mfa_failed", { userId: user.id, role: user.role, ip: requestIp(req) }, user.role === "ADMIN" ? "alert" : "warn");
    return NextResponse.json({ error: "That code isn't right. Check your authenticator app and try again." }, { status: 401 });
  }

  if (usedRecoveryCode) {
    const remaining = await prisma.mfaRecoveryCode.count({ where: { userId: user.id, usedAt: null } });
    await logSecurityEvent("mfa_recovery_code_used", { userId: user.id, remaining }, "warn");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date(), lastSeenAt: new Date() },
  });

  const token = signToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    universityId: user.universityId,
    sv: user.sessionVersion,
  }, parsed.data.keepSignedIn ?? true);

  // Same response shape as a normal login, so the login page's existing
  // success handling (save user, redirect by role) works unchanged.
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
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(undefined, parsed.data.keepSignedIn ?? true));
  return res;
}
