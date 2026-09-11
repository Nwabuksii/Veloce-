import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { signToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { sendWelcomeMessage } from "@/lib/scribe-lifecycle";

const verifySchema = z.object({
  token: z.string().min(1),
});

// This is the moment an account actually becomes real — the welcome
// message sends here (not at signup), and this is the first time the
// person ever gets logged in, since signup deliberately didn't do that.
export async function POST(req: NextRequest) {
  const parsed = verifySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing verification token" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { emailVerificationToken: parsed.data.token } });

  if (!user) {
    return NextResponse.json({ error: "This verification link is invalid." }, { status: 400 });
  }

  if (user.emailVerifiedAt) {
    // Already verified (e.g. they clicked the link twice) — just log them
    // in rather than showing an error for something that isn't one.
  } else if (!user.emailVerificationExpiresAt || user.emailVerificationExpiresAt < new Date()) {
    return NextResponse.json(
      { error: "This verification link has expired. Request a new one from the login page." },
      { status: 400 }
    );
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date(), emailVerificationToken: null, emailVerificationExpiresAt: null },
    });
    await sendWelcomeMessage(user.id, "student");
  }

  const token = signToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    universityId: user.universityId,
  });

  const res = NextResponse.json({
    user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
  });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
