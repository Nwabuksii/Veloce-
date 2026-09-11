import { prisma } from "@/lib/prisma";

// How long a student must wait after a REJECTED scribe application before
// they're allowed to apply again.
export const REAPPLY_COOLDOWN_DAYS = 14;

// How long a demoted scribe must wait after a REJECTED appeal before they
// can submit another one. Their very first appeal after a demotion has no
// cooldown — this only applies between repeated appeal attempts.
export const APPEAL_COOLDOWN_DAYS = 30;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Looks at the most recent row of the given type for this user and decides
 * whether they're allowed to submit a new one right now.
 */
export async function checkCooldown(
  userId: string,
  type: "APPLICATION" | "APPEAL"
): Promise<{ allowed: boolean; reason?: string; retryAt?: Date; pendingId?: string }> {
  const latest = await prisma.scribeApplication.findFirst({
    where: { userId, type },
    orderBy: { submittedAt: "desc" },
  });

  if (!latest) return { allowed: true };

  if (latest.status === "PENDING") {
    return { allowed: false, reason: "You already have one pending review.", pendingId: latest.id };
  }

  if (latest.status === "REJECTED" && latest.reviewedAt) {
    const cooldownDays = type === "APPLICATION" ? REAPPLY_COOLDOWN_DAYS : APPEAL_COOLDOWN_DAYS;
    const retryAt = addDays(latest.reviewedAt, cooldownDays);
    if (new Date() < retryAt) {
      return {
        allowed: false,
        reason: `You can try again on ${retryAt.toDateString()}.`,
        retryAt,
      };
    }
  }

  // latest.status === "APPROVED" (or a REJECTED one past its cooldown) —
  // nothing blocking a new submission.
  return { allowed: true };
}

// senderId omitted (or explicitly null) => shows as a system message from
// "Veloce" rather than a specific admin.
export async function sendWelcomeMessage(
  recipientId: string,
  kind: "student" | "scribe" | "admin",
  senderId?: string | null
) {
  const content = {
    student: {
      subject: "Welcome to Veloce!",
      body: "Your account is set up. Browse your courses' blocks, or apply to become a Scribe if you'd like to start uploading and earning from notes.",
    },
    scribe: {
      subject: "You're now a Scribe!",
      body: "Congrats — your application was approved. You can now upload notes to any block, track sales from your Scribe dashboard, and start building a following.",
    },
    admin: {
      subject: "You've been made an Admin",
      body: "You now have admin access for your university — you can review Scribe applications and appeals, manage uploaded notes, and message students and scribes.",
    },
  }[kind];

  return prisma.adminMessage.create({
    data: {
      recipientId,
      senderId: senderId ?? null,
      subject: content.subject,
      body: content.body,
    },
  });
}
