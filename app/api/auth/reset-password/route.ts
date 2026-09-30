import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { passwordSchema } from "@/lib/password-policy";
import { logSecurityEvent } from "@/lib/security-log";

const resetSchema = z.object({
  token: z.string().min(1),
  newPassword: passwordSchema,
});

export async function POST(req: NextRequest) {
  const parsed = resetSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Tokens are stored hashed (see forgot-password), so hash what was sent.
  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");

  const user = await prisma.user.findUnique({ where: { passwordResetToken: tokenHash } });

  if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired. Request a new one." },
      { status: 400 }
    );
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);

  // Claim the token in the same statement that spends it: only one of two
  // simultaneous requests using the same link can match the WHERE clause.
  const claimed = await prisma.user.updateMany({
    where: { id: user.id, passwordResetToken: tokenHash, passwordResetExpiresAt: { gt: new Date() } },
    data: {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
      // A password reset is a good moment to also clear any accumulated
      // lockout — the person just proved account ownership via email.
      failedLoginAttempts: 0,
      lockedUntil: null,
      // Signs out every device/session that was open under the old password
      // (including an attacker's stolen token) — the reason most people
      // reset a password in the first place.
      sessionVersion: { increment: 1 },
    },
  });

  if (claimed.count !== 1) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired. Request a new one." },
      { status: 400 }
    );
  }

  await logSecurityEvent("password_reset_completed", { userId: user.id, role: user.role }, user.role === "ADMIN" ? "alert" : "warn");

  return NextResponse.json({ message: "Password updated — you can log in now." });
}
