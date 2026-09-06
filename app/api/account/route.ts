import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/auth";

// Deliberately does NOT allow changing fullName — only email and/or
// password. Both require the user's current password to confirm it's
// really them (a stolen session cookie alone shouldn't be enough to lock
// someone out of their own account).
const updateSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newEmail: z.string().email().optional(),
    newPassword: z.string().min(8, "New password must be at least 8 characters").optional(),
  })
  .refine((data) => data.newEmail || data.newPassword, {
    message: "Provide a new email and/or a new password",
  });

export const GET = requireRole("STUDENT", async (req: NextRequest, user) => {
  const dbUser = await prisma.user.findUnique({
    where: { id: user.sub },
    select: { id: true, email: true, fullName: true, role: true },
  });

  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ user: dbUser });
});

export const PATCH = requireRole("STUDENT", async (req: NextRequest, user) => {
  const parsed = updateSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { currentPassword, newEmail, newPassword } = parsed.data;

  const dbUser = await prisma.user.findUnique({ where: { id: user.sub } });
  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const passwordOk = await verifyPassword(currentPassword, dbUser.passwordHash);
  if (!passwordOk) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
  }

  const data: { email?: string; passwordHash?: string } = {};
  if (newEmail && newEmail.toLowerCase() !== dbUser.email.toLowerCase()) {
    data.email = newEmail.toLowerCase();
  }
  if (newPassword) {
    data.passwordHash = await hashPassword(newPassword);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: user.sub },
      data,
      select: { id: true, email: true, fullName: true, role: true },
    });
    return NextResponse.json({ user: updated });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "That email is already in use" }, { status: 409 });
    }
    throw err;
  }
});
