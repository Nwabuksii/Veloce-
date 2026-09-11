import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { passwordSchema } from "@/lib/password-policy";

const signupSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  fullName: z.string().min(2),
  universitySlug: z.string(), // e.g. "babcock" — which campus they belong to
  departmentId: z.string().optional(),
  level: z.string().optional(), // e.g. "200L"
});

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Deliberately does NOT log the user in or send the welcome message here —
// the account only becomes real once the verification link is clicked (see
// /api/auth/verify-email). Login is blocked entirely until then.
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
  const emailVerificationToken = randomBytes(32).toString("hex");

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName,
      universityId: university.id,
      departmentId,
      level,
      role: "STUDENT", // everyone starts as a Student; Scribe is an upgrade via application
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
      text: `Welcome to Veloce! Confirm your email to finish setting up your account: ${verifyUrl}\n\nThis link expires in 24 hours.`,
      html: `<p>Welcome to Veloce!</p><p><a href="${verifyUrl}">Click here to verify your email</a> and finish setting up your account.</p><p>This link expires in 24 hours.</p>`,
    });
  } catch (err) {
    // The account exists but no verification email went out — don't leave
    // the person stuck with no way forward; they can use "resend" on the
    // login page once they land there.
    console.error("Failed to send verification email:", err);
  }

  return NextResponse.json({
    message: "Check your email to verify your account before logging in.",
  });
}
