import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { hashPassword, verifyPassword, signToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { passwordSchema } from "@/lib/password-policy";
import { rateLimitResponse } from "@/lib/rate-limit";
import { logSecurityEvent, requestIp } from "@/lib/security-log";
import { CONFIRM_TTL_MS, REVERT_TTL_MS, newToken, sendAlertToOldAddress, sendConfirmToNewAddress } from "@/lib/email-change";

// Force Next.js to evaluate this API route dynamically at runtime,
// preventing static generation errors during Vercel builds.
export const dynamic = "force-dynamic";

// Deliberately does NOT allow changing fullName — only email, password,
// and/or the display theme. Email and password both require the user's
// current password to confirm it's really them (a stolen session cookie
// alone shouldn't be enough to lock someone out of their own account).
// Theme is low-stakes display preference, not a security-relevant change,
// so it's exempt from that requirement.
const updateSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password").optional(),
    newEmail: z.string().trim().toLowerCase().email().optional(),
    newPassword: passwordSchema.optional(),
    theme: z.enum(["light", "dark"]).optional(),
    // Which icon shows for this person — "custom" only works if they've
    // actually uploaded one (see POST /api/account/avatar); switching
    // this alone never uploads or deletes anything.
    avatarDisplay: z.enum(["default", "custom"]).optional(),
  })
  .refine((data) => data.newEmail || data.newPassword || data.theme || data.avatarDisplay, {
    message: "Provide something to update",
  })
  .refine((data) => !(data.newEmail || data.newPassword) || data.currentPassword, {
    message: "Enter your current password",
    path: ["currentPassword"],
  });

export const GET = requireRole("STUDENT", async (req: NextRequest, user) => {
  const dbUser = await prisma.user.findUnique({
    where: { id: user.sub },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      theme: true,
      creditBalance: true,
      avatarUrl: true,
      avatarDisplay: true,
      departmentId: true,
      level: true,
      department: { select: { name: true } },
      university: { select: { name: true } },
    },
  });

  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ user: dbUser });
}, { allowIncompleteProfile: true });

export const PATCH = requireRole("STUDENT", async (req: NextRequest, user) => {
  const parsed = updateSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { currentPassword, newEmail, newPassword, theme, avatarDisplay } = parsed.data;

  const dbUser = await prisma.user.findUnique({ where: { id: user.sub } });
  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (avatarDisplay === "custom" && !dbUser.avatarUrl) {
    return NextResponse.json({ error: "Upload a profile icon before switching to it" }, { status: 400 });
  }

  let emailChangeTo: string | null = null;

  const data: {
    passwordHash?: string;
    sessionVersion?: { increment: number };
    theme?: string;
    avatarDisplay?: string;
  } = {};

  // Only touch password verification at all if this request is actually
  // trying to change something that needs it.
  if (newEmail || newPassword) {
    // This endpoint is a password oracle: with a stolen session cookie an
    // attacker could otherwise guess currentPassword as fast as they can
    // send requests. Counted per account, only for requests that check it.
    const blocked = await rateLimitResponse(
      `account-password-check:${user.sub}`,
      5,
      15 * 60 * 1000,
      "Too many attempts. Please wait a few minutes and try again."
    );
    if (blocked) return blocked;

    const passwordOk = await verifyPassword(currentPassword!, dbUser.passwordHash);
    if (!passwordOk) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
    }
    if (newEmail && newEmail.toLowerCase() !== dbUser.email.toLowerCase()) {
      // The email is NOT changed here any more — it only changes once the
      // new address confirms (see /api/auth/confirm-email-change). This just
      // validates and remembers the request.
      const tooMany = await rateLimitResponse(
        `email-change:${user.sub}`,
        3,
        60 * 60 * 1000,
        "You've asked to change your email several times. Please wait an hour and try again."
      );
      if (tooMany) return tooMany;

      const taken = await prisma.user.findUnique({ where: { email: newEmail.toLowerCase() }, select: { id: true } });
      if (taken) {
        return NextResponse.json({ error: "That email is already in use" }, { status: 409 });
      }
      emailChangeTo = newEmail.toLowerCase();
    }
    if (newPassword) {
      data.passwordHash = await hashPassword(newPassword);
      // Signs out every OTHER session (a stolen cookie, a forgotten
      // library computer). This device is re-issued a fresh token below so
      // the person changing their password isn't kicked out themselves.
      data.sessionVersion = { increment: 1 };
    }
  }

  if (theme) {
    data.theme = theme;
  }

  if (avatarDisplay) {
    data.avatarDisplay = avatarDisplay;
  }

  if (Object.keys(data).length === 0 && !emailChangeTo) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: user.sub },
      // An empty `data` (email-change only) just re-reads the user.
      data,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        theme: true,
        creditBalance: true,
        avatarUrl: true,
        avatarDisplay: true,
        universityId: true,
        sessionVersion: true,
      },
    });

    if (data.passwordHash) await logSecurityEvent("password_changed", { userId: updated.id, role: updated.role });

    // Start the email change: one link to the NEW address that must be
    // clicked to finish it, one "this wasn't me" link to the OLD address.
    let pendingEmail: string | null = null;
    if (emailChangeTo) {
      const confirm = newToken();
      const revert = newToken();
      const now = Date.now();
      await prisma.$transaction([
        // A newer request replaces an unconfirmed one; confirmed rows stay
        // until their undo window ends. Expired rows are tidied here too.
        prisma.emailChangeRequest.deleteMany({
          where: { userId: updated.id, OR: [{ confirmedAt: null }, { revertExpiresAt: { lt: new Date(now) } }] },
        }),
        prisma.emailChangeRequest.create({
          data: {
            userId: updated.id,
            oldEmail: updated.email,
            newEmail: emailChangeTo,
            confirmTokenHash: confirm.hash,
            revertTokenHash: revert.hash,
            confirmExpiresAt: new Date(now + CONFIRM_TTL_MS),
            revertExpiresAt: new Date(now + REVERT_TTL_MS),
          },
        }),
      ]);

      try {
        await sendConfirmToNewAddress({ to: emailChangeTo, fullName: updated.fullName, confirmToken: confirm.raw });
      } catch (err) {
        console.error("Failed to send email-change confirmation:", err);
        await prisma.emailChangeRequest.deleteMany({ where: { confirmTokenHash: confirm.hash } });
        return NextResponse.json(
          { error: "We couldn't send a confirmation email to that address. Check it's spelled correctly and try again." },
          { status: 502 }
        );
      }
      // The alert is the safety net, so a failure here is logged loudly but
      // doesn't undo the request (the person still gets the confirm email).
      await sendAlertToOldAddress({
        to: updated.email,
        fullName: updated.fullName,
        newEmail: emailChangeTo,
        revertToken: revert.raw,
      }).catch((err) => console.error("Failed to send email-change alert to the old address:", err));

      await logSecurityEvent("email_change_requested", { userId: updated.id, role: updated.role, ip: requestIp(req) }, updated.role === "ADMIN" ? "warn" : "info");
      pendingEmail = emailChangeTo;
    }

    const { universityId, sessionVersion, ...publicUser } = updated;
    const res = NextResponse.json({ user: publicUser, emailChangePending: Boolean(pendingEmail), pendingEmail });
    if (data.sessionVersion) {
      res.cookies.set(
        SESSION_COOKIE,
        signToken({ sub: updated.id, email: updated.email, role: updated.role, universityId, sv: sessionVersion }),
        sessionCookieOptions()
      );
    }
    return res;
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "That email is already in use" }, { status: 409 });
    }
    throw err;
  }
});
