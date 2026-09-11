import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const resendSchema = z.object({
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  const parsed = resendSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });

  // Don't reveal whether the email exists — same generic response either way.
  const genericResponse = NextResponse.json({
    message: "If an account with that email exists and isn't verified yet, we've sent a new link.",
  });

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
      emailVerificationExpiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
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
