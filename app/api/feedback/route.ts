import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";

const feedbackSchema = z.object({
  message: z.string().min(3, "Say a bit more than that.").max(2000),
});

// Any logged-in role can leave feedback — STUDENT is the base rank in the
// hierarchy, so scribes and admins pass this check too.
export const POST = requireRole("STUDENT", async (req: NextRequest, user) => {
  const allowed = await checkRateLimit(`feedback:${user.sub}`, 10, 60 * 60 * 1000);
  if (!allowed) {
    return NextResponse.json({ error: "Too much feedback at once — try again later." }, { status: 429 });
  }

  const parsed = feedbackSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const feedback = await prisma.feedback.create({
    data: { userId: user.sub, message: parsed.data.message },
  });

  return NextResponse.json({ feedback: { id: feedback.id } });
});

// Admin-only read of everyone's feedback, newest first.
export const GET = requireRole("ADMIN", async (req: NextRequest, adminUser) => {
  const feedback = await prisma.feedback.findMany({
    where: { user: { universityId: adminUser.universityId } },
    include: { user: { select: { id: true, fullName: true, role: true, avatarUrl: true, avatarDisplay: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({
    feedback: feedback.map((f) => ({
      id: f.id,
      message: f.message,
      createdAt: f.createdAt,
      authorId: f.user.id,
      authorName: f.user.fullName,
      authorRole: f.user.role,
      authorAvatarUrl: f.user.avatarDisplay === "custom" ? f.user.avatarUrl : null,
    })),
  });
});
