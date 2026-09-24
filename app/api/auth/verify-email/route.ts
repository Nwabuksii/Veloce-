import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { signToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { sendWelcomeMessage } from "@/lib/scribe-lifecycle";

const verifySchema = z.object({
  token: z.string().min(1),
});

// This is the moment an account actually becomes real — see
// app/api/auth/signup, which deliberately never touched the User table at
// all. Checks PendingRegistration first (the current flow); falls back to
// the legacy User.emailVerificationToken path for anyone who signed up
// before this change and still has an old-style link sitting in their
// inbox, so this deploy doesn't strand them mid-verification.
export async function POST(req: NextRequest) {
  const parsed = verifySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing verification token" }, { status: 400 });
  }
  const { token } = parsed.data;

  const pending = await prisma.pendingRegistration.findUnique({ where: { verificationToken: token } });

  if (pending) {
    if (pending.expiresAt < new Date()) {
      // Strict — no grace period. Delete it and send them back to signup.
      await prisma.pendingRegistration.delete({ where: { id: pending.id } }).catch(() => {});
      return NextResponse.json(
        { error: "This verification link has expired (links are only valid for 5 minutes). Please sign up again." },
        { status: 400 }
      );
    }

    let user;
    try {
      const result = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: pending.email,
            passwordHash: pending.passwordHash,
            fullName: pending.fullName,
            fullNameNormalized: pending.fullNameNormalized,
            universityId: pending.universityId,
            departmentId: pending.departmentId,
            level: pending.level,
            termsAcceptedAt: pending.termsAcceptedAt,
            role: "STUDENT",
            emailVerifiedAt: new Date(),
          },
        });
        await tx.pendingRegistration.delete({ where: { id: pending.id } });
        return created;
      });
      user = result;
    } catch (err: any) {
      // Someone else grabbed the email/name in the few minutes this was
      // pending (extremely unlikely, but not impossible) — the pending
      // row is now orphaned either way, so clear it and ask them to retry.
      await prisma.pendingRegistration.delete({ where: { id: pending.id } }).catch(() => {});
      if (err?.code === "P2002") {
        return NextResponse.json(
          { error: "That email or name was taken while you were verifying. Please sign up again." },
          { status: 409 }
        );
      }
      throw err;
    }

    await sendWelcomeMessage(user.id, "student");

    const jwt = signToken({ sub: user.id, email: user.email, role: user.role, universityId: user.universityId });
    const res = NextResponse.json({ user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role } });
    res.cookies.set(SESSION_COOKIE, jwt, sessionCookieOptions());
    return res;
  }

  // Legacy path — no matching PendingRegistration, fall back to the old
  // User-based flow for anyone still mid-verification from before this change.
  const user = await prisma.user.findUnique({ where: { emailVerificationToken: token } });

  if (!user) {
    return NextResponse.json({ error: "This verification link is invalid." }, { status: 400 });
  }

  if (user.emailVerifiedAt) {
    // Already verified (e.g. they clicked the link twice) — just log them
    // in rather than showing an error for something that isn't one.
  } else if (!user.emailVerificationExpiresAt || user.emailVerificationExpiresAt < new Date()) {
    return NextResponse.json(
      { error: "This verification link has expired. Request a new one from the login page." },
      { status: 400 }
    );
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date(), emailVerificationToken: null, emailVerificationExpiresAt: null },
    });
    await sendWelcomeMessage(user.id, "student");
  }

  const token2 = signToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    universityId: user.universityId,
  });

  const res = NextResponse.json({
    user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
  });
  res.cookies.set(SESSION_COOKIE, token2, sessionCookieOptions());
  return res;
}
