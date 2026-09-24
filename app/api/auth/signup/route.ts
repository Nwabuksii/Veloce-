import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { passwordSchema } from "@/lib/password-policy";
import { checkRateLimit, ipKeyFrom } from "@/lib/rate-limit";

const signupSchema = z
  .object({
    email: z.string().email(),
    password: passwordSchema,
    fullName: z.string().min(2),
    universitySlug: z.string(), // e.g. "babcock" — which campus they belong to
    departmentId: z.string().optional(),
    level: z.string().optional(), // e.g. "200L"
    // Required, un-checked-by-default checkbox on the signup form.
    termsAccepted: z.boolean(),
  })
  .refine((data) => data.termsAccepted === true, {
    message: "You must accept the Terms of Service",
    path: ["termsAccepted"],
  });

// Strict, non-negotiable — see PendingRegistration.expiresAt. Resending a
// link (see /api/auth/resend-verification) issues a fresh token but never
// pushes this deadline out.
const VERIFICATION_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Names reserved for the platform itself, never available to a real
// account — checked as a case-insensitive exact match against the whole
// display name (so "Admin" and "  admin  " are blocked, but "Admin Okoye"
// is not).
const RESERVED_NAMES = new Set(["veloce", "admin", "ceo", "scribe", "student"]);

/** Case-insensitive uniqueness key for a display name — see User.fullNameNormalized. */
function normalizeFullName(fullName: string): string {
  return fullName.trim().toLowerCase();
}

// Sign-up does NOT write to User at all. It writes a PendingRegistration
// row instead, which only becomes a real account if the verification link
// is clicked within 5 minutes (see /api/auth/verify-email) — an
// unverified, possibly-throwaway signup never touches the real user table.
export async function POST(req: NextRequest) {
  const allowed = await checkRateLimit(ipKeyFrom(req, "signup"), 8, 60 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many signups from this network. Try again later." }, { status: 429 });
  }

  const parsed = signupSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, password, fullName, universitySlug, departmentId, level } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const fullNameNormalized = normalizeFullName(fullName);
  if (RESERVED_NAMES.has(fullNameNormalized)) {
    return NextResponse.json({ error: "That name is reserved and can't be used" }, { status: 400 });
  }

  const university = await prisma.university.findUnique({ where: { slug: universitySlug } });
  if (!university) {
    return NextResponse.json({ error: "Unknown university" }, { status: 400 });
  }

  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existingUser) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }
  const nameTakenByUser = await prisma.user.findUnique({ where: { fullNameNormalized } });
  if (nameTakenByUser) {
    return NextResponse.json({ error: "That name is already taken — try adding a middle name or initial" }, { status: 409 });
  }

  // Clean up any stale pending row for this email/name first — a lapsed
  // 5-minute attempt shouldn't block a fresh one, and there's no scheduled
  // job sweeping these, so encountering one here is also how they get
  // cleaned up in practice.
  await prisma.pendingRegistration.deleteMany({
    where: { OR: [{ email: normalizedEmail }, { fullNameNormalized }], expiresAt: { lt: new Date() } },
  });

  const stillPendingEmail = await prisma.pendingRegistration.findUnique({ where: { email: normalizedEmail } });
  if (stillPendingEmail) {
    return NextResponse.json(
      { error: "A verification link was already sent to this email — check your inbox, or wait for it to expire and try again." },
      { status: 409 }
    );
  }
  const stillPendingName = await prisma.pendingRegistration.findUnique({ where: { fullNameNormalized } });
  if (stillPendingName) {
    return NextResponse.json({ error: "That name is already taken — try adding a middle name or initial" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const verificationToken = randomBytes(32).toString("hex");
  const now = new Date();

  let pending;
  try {
    pending = await prisma.pendingRegistration.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        fullName,
        fullNameNormalized,
        universityId: university.id,
        departmentId,
        level,
        termsAcceptedAt: now,
        verificationToken,
        createdAt: now,
        expiresAt: new Date(now.getTime() + VERIFICATION_TOKEN_TTL_MS),
      },
    });
  } catch (err: any) {
    // Race: two signups for the same name/email landed at the same moment.
    if (err?.code === "P2002") {
      const target = String(err?.meta?.target ?? "");
      if (target.includes("fullNameNormalized")) {
        return NextResponse.json({ error: "That name is already taken — try adding a middle name or initial" }, { status: 409 });
      }
      return NextResponse.json(
        { error: "A verification link was already sent to this email — check your inbox." },
        { status: 409 }
      );
    }
    throw err;
  }

  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=${verificationToken}`;

  try {
    await sendEmail({
      to: pending.email,
      subject: "Verify your Veloce account — link expires in 5 minutes",
      text: `Welcome to Veloce! Confirm your email to finish setting up your account: ${verifyUrl}\n\nThis link expires in 5 minutes — if it lapses, you'll need to sign up again.`,
      html: `<p>Welcome to Veloce!</p><p><a href="${verifyUrl}">Click here to verify your email</a> and finish setting up your account.</p><p><strong>This link expires in 5 minutes</strong> — if it lapses, you'll need to sign up again.</p>`,
    });
  } catch (err) {
    // The pending row exists but no email went out — they can use "resend"
    // on the login page, as long as they do it within the 5-minute window.
    console.error("Failed to send verification email:", err);
  }

  return NextResponse.json({
    message: "Check your email to verify your account within the next 5 minutes.",
  });
}
