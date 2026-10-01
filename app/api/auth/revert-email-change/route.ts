import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, ipKeyFrom } from "@/lib/rate-limit";
import { hashToken } from "@/lib/email-change";
import { logSecurityEvent, requestIp } from "@/lib/security-log";

const schema = z.object({ token: z.string().min(1) });

const INVALID = "This link is invalid or has expired. If you're worried about your account, reset your password now.";

// The "this wasn't me" link sent to the OLD address. Cancels a pending
// email change, or — if the change already went through — puts the old
// email back. Either way every device is signed out. Clicked from a page
// button for the same reason as the confirm link.
export async function POST(req: NextRequest) {
  const allowed = await checkRateLimit(ipKeyFrom(req, "revert-email-change"), 20, 60 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: INVALID }, { status: 400 });

  const request = await prisma.emailChangeRequest.findUnique({
    where: { revertTokenHash: hashToken(parsed.data.token) },
    include: { user: { select: { id: true, role: true, email: true } } },
  });
  if (!request || request.revertExpiresAt < new Date()) {
    return NextResponse.json({ error: INVALID }, { status: 400 });
  }

  const wasConfirmed = Boolean(request.confirmedAt);
  let restored = false;
  let couldNotRestore = false;

  try {
    await prisma.$transaction(async (tx) => {
      // The email goes back only if the change had actually happened.
      if (wasConfirmed && request.user.email !== request.oldEmail) {
        await tx.user.update({
          where: { id: request.userId },
          data: { email: request.oldEmail, sessionVersion: { increment: 1 } },
        });
        restored = true;
      } else {
        await tx.user.update({ where: { id: request.userId }, data: { sessionVersion: { increment: 1 } } });
      }
      // Cancels this request and any other change still waiting on a click.
      await tx.emailChangeRequest.deleteMany({ where: { userId: request.userId } });
    });
  } catch (err: any) {
    if (err?.code !== "P2002") throw err;
    // The old address was registered by someone else in the meantime.
    couldNotRestore = true;
    await prisma.$transaction([
      prisma.user.update({ where: { id: request.userId }, data: { sessionVersion: { increment: 1 } } }),
      prisma.emailChangeRequest.deleteMany({ where: { userId: request.userId } }),
    ]);
  }

  await logSecurityEvent("email_change_reverted", { userId: request.userId, role: request.user.role, restored, ip: requestIp(req) }, "alert");

  return NextResponse.json({
    restored,
    couldNotRestore,
    message: couldNotRestore
      ? "We cancelled the change and signed every device out, but couldn't put your old email back because another account now uses it. Contact support."
      : restored
        ? "Your old email has been put back and every device has been signed out."
        : "The email change was cancelled and every device has been signed out.",
  });
}
