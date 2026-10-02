import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { AUTH_MIN_RESPONSE_MS, padToMinimum } from "@/lib/timing";
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
const VERIFICATION_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Names reserved for the platform itself, never available to a real
// account — checked as a case-insensitive exact match against the whole
// display name (so "Admin" and "  admin  " are blocked, but "Admin Okoye"
// is not).
const RESERVED_NAMES = new Set(["veloce", "admin", "ceo", "scribe", "student", "deleted user"]);

/** Case-insensitive uniqueness key for a display name — see User.fullNameNormalized. */
function normalizeFullName(fullName: string): string {
  return fullName.trim().toLowerCase();
}

// Brevo/network failures and a missing app URL must never look like success.
function verifyLink(token: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL is not set — verification links would be broken");
  return `${appUrl.replace(/\/$/, "")}/verify-email?token=${token}`;
}

const SIGNUP_MESSAGE = "Check your email to verify your account within the next 10 minutes.";

// Someone signed up with an email that already has an account. The form
// can't say so (that would let anyone check which emails are registered), so
// the real owner is told by email instead. At most one per address per hour,
// so the form can't be used to fill somebody's inbox.
async function notifyExistingOwner(email: string) {
  if (!(await checkRateLimit(`signup-notice:${email}`, 1, 60 * 60 * 1000))) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  try {
    await sendEmail({
      to: email,
      subject: "Someone tried to sign up to Veloce with your email",
      text: `Someone just tried to create a Veloce account with this email address, but you already have one.\n\nIf that was you, log in here: ${appUrl}/login — or reset your password: ${appUrl}/forgot-password\n\nIf it wasn't you, you can ignore this email. Nothing about your account has changed.`,
      html: `<p>Someone just tried to create a Veloce account with this email address, but you already have one.</p><p>If that was you, <a href="${appUrl}/login">log in</a> — or <a href="${appUrl}/forgot-password">reset your password</a>.</p><p>If it wasn't you, you can ignore this email. Nothing about your account has changed.</p>`,
    });
  } catch (err) {
    console.error("Failed to send existing-account notice:", err);
  }
}

// Sign-up does NOT write to User at all. It writes a PendingRegistration
// row instead, which only becomes a real account if the verification link
// is clicked within 10 minutes (see /api/auth/verify-email) — an
// unverified, possibly-throwaway signup never touches the real user table.
export async function POST(req: NextRequest) {
  const allowed = await checkRateLimit(ipKeyFrom(req, "signup"), 8, 60 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many signups from this network. Try again later." }, { status: 429 });
  }

  const started = Date.now();
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

  // Every "we already know this email" outcome (a real account, or a signup
  // still waiting on its link) gets the SAME answer as a brand-new signup, so
  // this form can't be used to find out who is registered. The password is
  // hashed on every path for the same reason: without it, an existing email
  // would answer visibly faster than a new one. Taken NAMES are still
  // reported — unique display names are a product rule, and that message was
  // kept on purpose.
  const passwordHash = await hashPassword(password);
  const respondGeneric = async () => {
    await padToMinimum(started, AUTH_MIN_RESPONSE_MS);
    return NextResponse.json({ message: SIGNUP_MESSAGE });
  };

  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existingUser) {
    await notifyExistingOwner(existingUser.email);
    return respondGeneric();
  }
  const nameTakenByUser = await prisma.user.findUnique({ where: { fullNameNormalized } });
  if (nameTakenByUser) {
    return NextResponse.json({ error: "That name is already taken — try adding a middle name or initial" }, { status: 409 });
  }

  // Clean up any stale pending row for this email/name first — a lapsed
  // 10-minute attempt shouldn't block a fresh one, and there's no scheduled
  // job sweeping these, so encountering one here is also how they get
  // cleaned up in practice.
  await prisma.pendingRegistration.deleteMany({
    where: { OR: [{ email: normalizedEmail }, { fullNameNormalized }], expiresAt: { lt: new Date() } },
  });

  const stillPendingEmail = await prisma.pendingRegistration.findUnique({ where: { email: normalizedEmail } });
  if (stillPendingEmail) {
    // They signed up again because the first email never showed up. Send the
    // SAME link again (at most once a minute per address) rather than saying
    // "check your email" and sending nothing. The stored password and name
    // are deliberately left untouched — letting a repeat signup overwrite
    // them would let anyone set the password on someone else's pending signup.
    if (await checkRateLimit(`signup-resend:${normalizedEmail}`, 1, 60 * 1000)) {
      const minutesLeft = Math.max(1, Math.ceil((stillPendingEmail.expiresAt.getTime() - Date.now()) / 60000));
      try {
        const url = verifyLink(stillPendingEmail.verificationToken);
        await sendEmail({
          to: stillPendingEmail.email,
          subject: "Verify your Veloce account — link expires soon",
          text: `Confirm your email to finish setting up your account: ${url}\n\nThis link expires in about ${minutesLeft} minute(s).`,
          html: `<p><a href="${url}">Click here to verify your email</a> and finish setting up your account.</p><p>This link expires in about ${minutesLeft} minute(s).</p>`,
        });
      } catch (err) {
        console.error("Failed to re-send verification email on repeat signup:", err);
      }
    }
    return respondGeneric();
  }
  const stillPendingName = await prisma.pendingRegistration.findUnique({ where: { fullNameNormalized } });
  if (stillPendingName) {
    return NextResponse.json({ error: "That name is already taken — try adding a middle name or initial" }, { status: 409 });
  }

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
      return respondGeneric();
    }
    throw err;
  }

  try {
    const verifyUrl = verifyLink(verificationToken);
    await sendEmail({
      to: pending.email,
      subject: "Verify your Veloce account — link expires in 10 minutes",
      text: `Welcome to Veloce! Confirm your email to finish setting up your account: ${verifyUrl}\n\nThis link expires in 10 minutes — if it lapses, you'll need to sign up again.`,
      html: `<p>Welcome to Veloce!</p><p><a href="${verifyUrl}">Click here to verify your email</a> and finish setting up your account.</p><p><strong>This link expires in 10 minutes</strong> — if it lapses, you'll need to sign up again.</p>`,
    });
  } catch (err) {
    // No email went out. Don't tell them to check their inbox: drop the
    // pending row (so an immediate retry isn't blocked by it) and say so.
    console.error("Failed to send verification email:", err);
    await prisma.pendingRegistration.delete({ where: { id: pending.id } }).catch(() => {});
    return NextResponse.json({ error: "We couldn't send your verification email right now. Please try again in a minute." }, { status: 502 });
  }

  return respondGeneric();
}
