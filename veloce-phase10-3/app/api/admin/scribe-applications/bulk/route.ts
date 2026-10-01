import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { logSecurityEvent } from "@/lib/security-log";
import { sendWelcomeMessage } from "@/lib/scribe-lifecycle";
import { applicantUserSelect, scoreApplicantUser } from "@/lib/applicant-score";

const MAX_IDS = 500;
const MAX_MESSAGE = 1000;

// Batch decision over the applications the admin is looking at (their
// filtered list). The score is re-checked here against the threshold, so a
// stale screen can never approve or reject someone outside the chosen range.
//   approve: everyone scoring AT OR ABOVE threshold becomes a scribe
//   reject:  everyone scoring AT OR BELOW threshold is rejected and gets the
//            admin's message
export const POST = requireRole("ADMIN", async (req: NextRequest, adminUser) => {
  const body = await req.json().catch(() => null);
  const action = body?.action;
  const threshold = Number(body?.threshold);
  const ids: unknown = body?.ids;
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "Action must be approve or reject" }, { status: 400 });
  }
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    return NextResponse.json({ error: "Percentage must be between 0 and 100" }, { status: 400 });
  }
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_IDS || ids.some((i) => typeof i !== "string")) {
    return NextResponse.json({ error: `Pick between 1 and ${MAX_IDS} applications` }, { status: 400 });
  }
  if (action === "reject" && (!message || message.length > MAX_MESSAGE)) {
    return NextResponse.json({ error: `Write a message to the applicants (up to ${MAX_MESSAGE} characters)` }, { status: 400 });
  }

  const apps = await prisma.scribeApplication.findMany({
    where: {
      id: { in: ids as string[] },
      status: "PENDING",
      type: "APPLICATION",
      user: { universityId: adminUser.universityId },
    },
    include: { user: { select: applicantUserSelect } },
  });

  const matching = apps.filter((a) => {
    const { score } = scoreApplicantUser(a.user);
    return action === "approve" ? score >= threshold : score <= threshold;
  });

  let processed = 0;
  for (const app of matching) {
    // The status guard means an application someone else just decided is skipped.
    const done = await prisma.$transaction(async (tx) => {
      const res = await tx.scribeApplication.updateMany({
        where: { id: app.id, status: "PENDING" },
        data: { status: action === "approve" ? "APPROVED" : "REJECTED", reviewedAt: new Date(), reviewedById: adminUser.sub },
      });
      if (res.count === 0) return false;
      if (action === "approve") await tx.user.update({ where: { id: app.userId }, data: { role: "SCRIBE" } });
      return true;
    });
    if (!done) continue;
    processed++;

    if (action === "approve") {
      await logSecurityEvent("role_changed", { userId: app.userId, from: "STUDENT", to: "SCRIBE", byAdminId: adminUser.sub });
      await sendWelcomeMessage(app.userId, "scribe", adminUser.sub);
    } else {
      await prisma.adminMessage.create({
        data: { recipientId: app.userId, senderId: adminUser.sub, subject: "Update on your Scribe application", body: message },
      });
    }
  }

  return NextResponse.json({ processed, skipped: ids.length - processed });
});
