import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

const RESEND_COOLDOWN_MS = 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour — shorter than email verification's 24h, since a live reset link is a more sensitive thing to leave valid for long

const forgotSchema = z.object({
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  const parsed = forgotSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });

  // Same generic response whether or not the email exists — never reveal
  // which emails are registered.
  const genericResponse = NextResponse.json({
    message: "If an account with that email exists, we've sent a password reset link.",
  });

  if (!user) {
    return genericResponse;
  }

  if (
    user.lastPasswordResetEmailSentAt &&
    Date.now() - user.lastPasswordResetEmailSentAt.getTime() < RESEND_COOLDOWN_MS
  ) {
    // Still return the generic response — don't leak timing info about
    // whether the account exists via a different error shape.
    return genericResponse;
  }

  const passwordResetToken = randomBytes(32).toString("hex");

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken,
      passwordResetExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      lastPasswordResetEmailSentAt: new Date(),
    },
  });

  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${passwordResetToken}`;

  try {
    await sendEmail({
      to: user.email,
      subject: "Reset your Veloce password",
      text: `Reset your password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
      html: `<p><a href="${resetUrl}">Click here to reset your password</a>.</p><p>This link expires in 1 hour. If you didn't request this, ignore this email — your password won't change.</p>`,
    });
  } catch (err) {
    console.error("Failed to send password reset email:", err);
  }

  return genericResponse;
}
