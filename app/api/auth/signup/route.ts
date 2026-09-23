import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { passwordSchema } from "@/lib/password-policy";
import { checkRateLimit, ipKeyFrom } from "@/lib/rate-limit";

const signupSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  fullName: z.string().min(2),
  universitySlug: z.string(), // e.g. "babcock" — which campus they belong to
  departmentId: z.string().optional(),
  level: z.string().optional(), // e.g. "200L"
});

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Names reserved for the platform itself, never available to a real
// account — checked as a case-insensitive exact match against the whole
// display name (so "Admin" and "  admin  " are blocked, but "Admin Okoye"
// is not).
const RESERVED_NAMES = new Set(["veloce", "admin", "ceo", "scribe", "student"]);

/** Case-insensitive uniqueness key for a display name — see User.fullNameNormalized. */
function normalizeFullName(fullName: string): string {
  return fullName.trim().toLowerCase();
}

// Deliberately does NOT log the user in or send the welcome message here —
// the account only becomes real once the verification link is clicked (see
// /api/auth/verify-email). Login is blocked entirely until then.
export async function POST(req: NextRequest) {
  const allowed = await checkRateLimit(ipKeyFrom(req, "signup"), 8, 60 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many signups from this network. Try again later." }, { status: 429 });
  }

  const body = await req.json();
  const parsed = signupSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, password, fullName, universitySlug, departmentId, level } = parsed.data;

  const fullNameNormalized = normalizeFullName(fullName);
  if (RESERVED_NAMES.has(fullNameNormalized)) {
    return NextResponse.json({ error: "That name is reserved and can't be used" }, { status: 400 });
  }

  const university = await prisma.university.findUnique({ where: { slug: universitySlug } });
  if (!university) {
    return NextResponse.json({ error: "Unknown university" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  // Every display name on Veloce is unique, case-insensitively — checked
  // here for a fast, friendly error, and enforced for real by the
  // fullNameNormalized unique constraint below (the DB is the actual
  // guard against two signups racing on the same name at once; this is
  // just so the common case doesn't have to fall through to that).
  const nameTaken = await prisma.user.findUnique({ where: { fullNameNormalized } });
  if (nameTaken) {
    return NextResponse.json({ error: "That name is already taken — try adding a middle name or initial" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const emailVerificationToken = randomBytes(32).toString("hex");

  let user;
  try {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        fullNameNormalized,
        universityId: university.id,
        departmentId,
        level,
        role: "STUDENT", // everyone starts as a Student; Scribe is an upgrade via application
        emailVerificationToken,
        emailVerificationExpiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
        lastVerificationEmailSentAt: new Date(),
      },
    });
  } catch (err: any) {
    // Race: two signups for the same name (or email) landed at the same
    // moment and both passed the checks above — the DB's unique
    // constraint is what actually decides who wins.
    if (err?.code === "P2002") {
      const target = String(err?.meta?.target ?? "");
      if (target.includes("fullNameNormalized")) {
        return NextResponse.json({ error: "That name is already taken — try adding a middle name or initial" }, { status: 409 });
      }
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }
    throw err;
  }

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
