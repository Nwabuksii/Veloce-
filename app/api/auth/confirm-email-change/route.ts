import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, ipKeyFrom } from "@/lib/rate-limit";
import { hashToken } from "@/lib/email-change";
import { logSecurityEvent, requestIp } from "@/lib/security-log";

const schema = z.object({ token: z.string().min(1) });

const INVALID = "This link is invalid or has expired. Start the email change again from Settings.";

// Called by the page the NEW address's email links to, only when the person
// clicks its button (a plain GET link would be spent by email scanners that
// open links automatically).
export async function POST(req: NextRequest) {
  const allowed = await checkRateLimit(ipKeyFrom(req, "confirm-email-change"), 20, 60 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: INVALID }, { status: 400 });

  const request = await prisma.emailChangeRequest.findUnique({
    where: { confirmTokenHash: hashToken(parsed.data.token) },
    include: { user: { select: { id: true, role: true } } },
  });
  if (!request || request.confirmedAt || request.confirmExpiresAt < new Date()) {
    return NextResponse.json({ error: INVALID }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Claim the request in the same statement that spends it, so two
      // simultaneous clicks can't both apply it.
      const claimed = await tx.emailChangeRequest.updateMany({
        where: { id: request.id, confirmedAt: null, confirmExpiresAt: { gt: new Date() } },
        data: { confirmedAt: new Date() },
      });
      if (claimed.count !== 1) throw new Error("ALREADY_USED");

      await tx.user.update({
        where: { id: request.userId },
        data: {
          email: request.newEmail,
          // The session cookie carries the old email, and the account just
          // changed hands in a sensitive way — sign every device out.
          sessionVersion: { increment: 1 },
        },
      });
    });
  } catch (err: any) {
    if (err?.message === "ALREADY_USED") return NextResponse.json({ error: INVALID }, { status: 400 });
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "That email was taken by another account in the meantime. Pick a different one in Settings." }, { status: 409 });
    }
    throw err;
  }

  await logSecurityEvent("email_change_confirmed", { userId: request.userId, role: request.user.role, ip: requestIp(req) }, request.user.role === "ADMIN" ? "alert" : "warn");

  return NextResponse.json({ message: "Your email has been changed. Sign in again with the new address." });
}
