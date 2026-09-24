import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { checkRateLimit, ipKeyFrom } from "@/lib/rate-limit";

const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const LEGACY_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const resendSchema = z.object({
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  const allowed = await checkRateLimit(ipKeyFrom(req, "resend-verification"), 8, 60 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests from this network. Try again later." }, { status: 429 });
  }

  const parsed = resendSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase();

  // Don't reveal whether the email exists — same generic response either way.
  const genericResponse = NextResponse.json({
    message: "If a pending signup or unverified account exists for that email, we've sent a new link.",
  });

  const pending = await prisma.pendingRegistration.findUnique({ where: { email } });
  if (pending) {
    if (pending.expiresAt < new Date()) {
      // Expired — strictly no extending it. Clean up and let them know to
      // start over, rather than silently doing nothing.
      await prisma.pendingRegistration.delete({ where: { id: pending.id } }).catch(() => {});
      return NextResponse.json(
        { error: "That signup's 5-minute window has expired. Please sign up again." },
        { status: 400 }
      );
    }

    // A fresh token, same deadline — resending never pushes expiresAt out
    // further, it only makes sure the (possibly lost) email goes out again.
    const verificationToken = randomBytes(32).toString("hex");
    await prisma.pendingRegistration.update({ where: { id: pending.id }, data: { verificationToken } });

    const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=${verificationToken}`;
    const minutesLeft = Math.max(1, Math.ceil((pending.expiresAt.getTime() - Date.now()) / 60000));

    try {
      await sendEmail({
        to: pending.email,
        subject: "Verify your Veloce account — link expires soon",
        text: `Confirm your email to finish setting up your account: ${verifyUrl}\n\nThis link expires in about ${minutesLeft} minute(s) — the original 5-minute window doesn't reset.`,
        html: `<p><a href="${verifyUrl}">Click here to verify your email</a> and finish setting up your account.</p><p>This link expires in about ${minutesLeft} minute(s) — the original 5-minute window doesn't reset.</p>`,
      });
    } catch (err) {
      console.error("Failed to resend verification email:", err);
      return NextResponse.json({ error: "Couldn't send the email — try again shortly." }, { status: 502 });
    }
    return genericResponse;
  }

  // Legacy path — an old-style unverified User row with no PendingRegistration.
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.emailVerifiedAt) {
    return genericResponse;
  }

  if (user.lastVerificationEmailSentAt && Date.now() - user.lastVerificationEmailSentAt.getTime() < RESEND_COOLDOWN_MS) {
    return NextResponse.json({ error: "Please wait a moment before requesting another link." }, { status: 429 });
  }

  const emailVerificationToken = randomBytes(32).toString("hex");
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerificationToken,
      emailVerificationExpiresAt: new Date(Date.now() + LEGACY_VERIFICATION_TOKEN_TTL_MS),
      lastVerificationEmailSentAt: new Date(),
    },
  });

  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=${emailVerificationToken}`;
  try {
    await sendEmail({
      to: user.email,
      subject: "Verify your Veloce account",
      text: `Confirm your email to finish setting up your account: ${verifyUrl}\n\nThis link expires in 24 hours.`,
      html: `<p><a href="${verifyUrl}">Click here to verify your email</a> and finish setting up your account.</p><p>This link expires in 24 hours.</p>`,
    });
  } catch (err) {
    console.error("Failed to resend verification email:", err);
    return NextResponse.json({ error: "Couldn't send the email — try again shortly." }, { status: 502 });
  }

  return genericResponse;
}
