import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { verifyPassword, signToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { rateLimitResponse } from "@/lib/rate-limit";
import {
  encryptSecret,
  decryptSecret,
  generateTotpSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  otpauthUri,
  verifyTotp,
} from "@/lib/mfa";
import { consumeMfaCode } from "@/lib/mfa-check";
import { logSecurityEvent } from "@/lib/security-log";

export const dynamic = "force-dynamic";

// Two-factor enrollment for admin accounts.
//
//   GET                          -> status
//   POST { action: "setup" }     -> start enrolling: returns the secret to type into an authenticator app
//   POST { action: "enable" }    -> confirm with the first code; returns the recovery codes ONCE
//   POST { action: "disable" }   -> turn it off (password + a current code)
//
// Setup and disable ask for the current password again, like changing an
// email or password does: a stolen session cookie alone shouldn't be enough
// to add or remove a second factor.

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setup"), currentPassword: z.string().min(1, "Enter your current password") }),
  z.object({ action: z.literal("enable"), code: z.string().min(6).max(12) }),
  z.object({ action: z.literal("disable"), currentPassword: z.string().min(1, "Enter your current password"), code: z.string().min(6).max(32) }),
]);

export const GET = requireRole("ADMIN", async (req: NextRequest, user) => {
  const dbUser = await prisma.user.findUnique({
    where: { id: user.sub },
    select: { mfaEnabledAt: true },
  });
  const recoveryCodesRemaining = dbUser?.mfaEnabledAt
    ? await prisma.mfaRecoveryCode.count({ where: { userId: user.sub, usedAt: null } })
    : 0;

  return NextResponse.json({
    enabled: Boolean(dbUser?.mfaEnabledAt),
    enabledAt: dbUser?.mfaEnabledAt ?? null,
    recoveryCodesRemaining,
  });
});

export const POST = requireRole("ADMIN", async (req: NextRequest, user) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;

  const dbUser = await prisma.user.findUnique({ where: { id: user.sub } });
  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Both password-checking actions are a password oracle for a stolen
  // cookie, so they share the limiter the account route uses.
  if (body.action === "setup" || body.action === "disable") {
    const blocked = await rateLimitResponse(
      `account-password-check:${user.sub}`,
      5,
      15 * 60 * 1000,
      "Too many attempts. Please wait a few minutes and try again."
    );
    if (blocked) return blocked;

    if (!(await verifyPassword(body.currentPassword, dbUser.passwordHash))) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
    }
  }

  if (body.action === "setup") {
    if (dbUser.mfaEnabledAt) {
      return NextResponse.json({ error: "Two-factor login is already on. Turn it off first to set it up again." }, { status: 409 });
    }
    // Starting again just replaces the unconfirmed secret.
    const secret = generateTotpSecret();
    await prisma.user.update({ where: { id: dbUser.id }, data: { mfaSecret: encryptSecret(secret) } });
    return NextResponse.json({ secret, otpauthUri: otpauthUri(secret, dbUser.email) });
  }

  if (body.action === "enable") {
    if (dbUser.mfaEnabledAt) {
      return NextResponse.json({ error: "Two-factor login is already on." }, { status: 409 });
    }
    if (!dbUser.mfaSecret) {
      return NextResponse.json({ error: "Start setup first." }, { status: 400 });
    }

    // Guessing the confirmation code is limited like any other code check.
    const blocked = await rateLimitResponse(`mfa-verify-user:${user.sub}`, 5, 15 * 60 * 1000, "Too many attempts. Please wait a few minutes and try again.");
    if (blocked) return blocked;

    let step: number | null = null;
    try {
      step = verifyTotp(decryptSecret(dbUser.mfaSecret), body.code);
    } catch (err) {
      console.error("MFA enable: could not decrypt pending secret for user", dbUser.id, err);
    }
    if (step === null) {
      return NextResponse.json({ error: "That code isn't right. Check your authenticator app and try again." }, { status: 400 });
    }

    const recoveryCodes = generateRecoveryCodes();

    // Only turns on if still off — two simultaneous confirmations can't
    // both issue recovery codes. Bumping sessionVersion signs out every
    // OTHER device (they logged in without a second factor); this one is
    // re-issued a fresh token below.
    const updated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.user.updateMany({
        where: { id: dbUser.id, mfaEnabledAt: null, mfaSecret: dbUser.mfaSecret },
        data: { mfaEnabledAt: new Date(), mfaLastStep: step, sessionVersion: { increment: 1 } },
      });
      if (claimed.count !== 1) return null;

      await tx.mfaRecoveryCode.deleteMany({ where: { userId: dbUser.id } });
      await tx.mfaRecoveryCode.createMany({
        data: recoveryCodes.map((code) => ({ userId: dbUser.id, codeHash: hashRecoveryCode(code) })),
      });
      return tx.user.findUnique({ where: { id: dbUser.id }, select: { id: true, email: true, role: true, universityId: true, sessionVersion: true } });
    });

    if (!updated) {
      return NextResponse.json({ error: "Two-factor login is already on." }, { status: 409 });
    }

    await logSecurityEvent("mfa_enabled", { userId: updated.id }, "warn");
    const res = NextResponse.json({ enabled: true, recoveryCodes });
    res.cookies.set(
      SESSION_COOKIE,
      signToken({ sub: updated.id, email: updated.email, role: updated.role, universityId: updated.universityId, sv: updated.sessionVersion }),
      sessionCookieOptions()
    );
    return res;
  }

  // action === "disable"
  if (!dbUser.mfaEnabledAt) {
    return NextResponse.json({ error: "Two-factor login isn't on." }, { status: 409 });
  }

  const blocked = await rateLimitResponse(`mfa-verify-user:${user.sub}`, 5, 15 * 60 * 1000, "Too many attempts. Please wait a few minutes and try again.");
  if (blocked) return blocked;

  const check = await consumeMfaCode(dbUser, body.code);
  if (!check.ok) {
    await logSecurityEvent("mfa_failed", { userId: dbUser.id, reason: "disable", }, "alert");
    return NextResponse.json({ error: "That code isn't right." }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.mfaRecoveryCode.deleteMany({ where: { userId: dbUser.id } });
    return tx.user.update({
      where: { id: dbUser.id },
      data: { mfaSecret: null, mfaEnabledAt: null, mfaLastStep: null, sessionVersion: { increment: 1 } },
      select: { id: true, email: true, role: true, universityId: true, sessionVersion: true },
    });
  });

  await logSecurityEvent("mfa_disabled", { userId: updated.id }, "alert");
  const res = NextResponse.json({ enabled: false });
  res.cookies.set(
    SESSION_COOKIE,
    signToken({ sub: updated.id, email: updated.email, role: updated.role, universityId: updated.universityId, sv: updated.sessionVersion }),
    sessionCookieOptions()
  );
  return res;
});
