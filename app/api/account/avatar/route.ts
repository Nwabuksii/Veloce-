import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { saveAvatarImage } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024; // 3MB — plenty for a profile icon
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Uploading always overwrites whatever avatar the user already had, and
// switches their display preference to "custom" — uploading a new photo
// and then still seeing the old generic icon would be confusing. Anyone
// who prefers the generic icon can switch back anytime via PATCH
// /api/account without losing the upload (see avatarDisplay on User).
export const POST = requireRole("STUDENT", async (req: NextRequest, user) => {
  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "An image file is required" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Only JPG, PNG, or WEBP images are accepted" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: `Image is too large — max ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB` }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const avatarUrl = await saveAvatarImage(buffer, user.sub, file.type);

  const updated = await prisma.user.update({
    where: { id: user.sub },
    data: { avatarUrl, avatarDisplay: "custom" },
    select: { avatarUrl: true, avatarDisplay: true },
  });

  return NextResponse.json({ user: updated });
});

// Clears the uploaded image entirely and falls back to the generic icon —
// for someone who uploaded the wrong thing and wants a clean slate rather
// than just toggling avatarDisplay back to "default" (which would leave
// the old image sitting there ready to reappear later).
export const DELETE = requireRole("STUDENT", async (req: NextRequest, user) => {
  const updated = await prisma.user.update({
    where: { id: user.sub },
    data: { avatarUrl: null, avatarDisplay: "default" },
    select: { avatarUrl: true, avatarDisplay: true },
  });

  return NextResponse.json({ user: updated });
});
