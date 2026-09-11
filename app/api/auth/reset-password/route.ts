import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { passwordSchema } from "@/lib/password-policy";

const resetSchema = z.object({
  token: z.string().min(1),
  newPassword: passwordSchema,
});

export async function POST(req: NextRequest) {
  const parsed = resetSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { passwordResetToken: parsed.data.token } });

  if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired. Request a new one." },
      { status: 400 }
    );
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
      // A password reset is a good moment to also clear any accumulated
      // lockout — the person just proved account ownership via email.
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  return NextResponse.json({ message: "Password updated — you can log in now." });
}
