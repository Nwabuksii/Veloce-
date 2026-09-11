import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { formatDateDDMMYYYY } from "@/lib/date-format";

export interface BanCheckResult {
  banned: boolean;
  reason?: string | null;
  until?: Date | null; // null while banned means indefinite
}

// Finds an admin at the given university to point people toward for
// appeals — same lookup the Settings page's "Contact admin" feature uses,
// so the address in a ban email always matches what they'd see there too.
async function findAdminContact(universityId: string): Promise<string | null> {
  const admin = await prisma.user.findFirst({
    where: { universityId, role: "ADMIN" },
    select: { email: true },
    orderBy: { createdAt: "asc" },
  });
  return admin?.email ?? process.env.EMAIL_SENDER_ADDRESS ?? null;
}

/**
 * The single source of truth for "is this user currently banned" —
 * called from both the login route and requireRole, so an existing
 * session is shut out just as effectively as a fresh login attempt.
 *
 * Also handles the "timer ran out" case lazily: there's no background job
 * in this stack to fire the instant a timed ban expires, so instead the
 * NEXT time the banned person tries to log in (or use an existing
 * session) after their banExpiresAt has passed, this function notices,
 * clears the ban, sends the "your suspension has ended" email right then,
 * and lets them straight through. In practice this fires within moments
 * of them actually trying to come back, which is when they'd care anyway.
 */
export async function checkAndResolveBan(userId: string): Promise<BanCheckResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { bannedAt: true, banReason: true, banExpiresAt: true, universityId: true, email: true, fullName: true },
  });

  if (!user || !user.bannedAt) {
    return { banned: false };
  }

  const stillActive = !user.banExpiresAt || user.banExpiresAt > new Date();

  if (stillActive) {
    return { banned: true, reason: user.banReason, until: user.banExpiresAt };
  }

  // Timed ban's clock has run out — lift it now and notify them.
  await prisma.user.update({
    where: { id: userId },
    data: { bannedAt: null, banReason: null, banExpiresAt: null, bannedById: null },
  });

  try {
    await sendEmail({
      to: user.email,
      subject: "Your Veloce suspension has ended",
      text: `Hi ${user.fullName},\n\nYour suspension period has ended — you can log in again now.`,
      html: `<p>Hi ${user.fullName},</p><p>Your suspension period has ended — you can log in again now.</p>`,
    });
  } catch (err) {
    console.error("Failed to send suspension-ended email:", err);
  }

  return { banned: false };
}

export async function sendBanEmail(params: {
  userId: string;
  email: string;
  fullName: string;
  universityId: string;
  reason?: string;
  until: Date | null; // null = indefinite
}) {
  const untilText = params.until
    ? `until ${formatDateDDMMYYYY(params.until)}`
    : "until further notice";
  const reasonText = params.reason ? ` Reason given: "${params.reason}".` : "";
  const contact = await findAdminContact(params.universityId);
  const contactText = contact
    ? ` If you believe this is a mistake, email us at ${contact}.`
    : " If you believe this is a mistake, reply to this email.";

  await sendEmail({
    to: params.email,
    subject: "Your Veloce account has been suspended",
    text: `Hi ${params.fullName},\n\nYour account has been suspended ${untilText}.${reasonText}${contactText}`,
    html: `<p>Hi ${params.fullName},</p><p>Your account has been suspended <strong>${untilText}</strong>.${reasonText}</p><p>${contactText}</p>`,
  });
}

export async function sendUnbanEmail(params: { email: string; fullName: string }) {
  await sendEmail({
    to: params.email,
    subject: "Your Veloce account has been reinstated",
    text: `Hi ${params.fullName},\n\nYour account has been unbanned — you can log in again now.`,
    html: `<p>Hi ${params.fullName},</p><p>Your account has been unbanned — you can log in again now.</p>`,
  });
}
