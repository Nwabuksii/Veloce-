import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";

const reviewSchema = z.object({
  purchaseId: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export const POST = requireRole("STUDENT", async (req: NextRequest, user) => {
  const body = await req.json();
  const parsed = reviewSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const purchase = await prisma.purchase.findUnique({
    where: { id: parsed.data.purchaseId },
    include: { review: true },
  });

  // Only the actual buyer can review it — this is what enforces
  // "reviews only from people who actually paid."
  if (!purchase || purchase.buyerId !== user.sub) {
    return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
  }
  if (purchase.review) {
    return NextResponse.json({ error: "You've already reviewed this" }, { status: 409 });
  }

  const review = await prisma.review.create({
    data: {
      purchaseId: purchase.id,
      noteId: purchase.noteId,
      reviewerId: user.sub,
      rating: parsed.data.rating,
      comment: parsed.data.comment,
    },
  });

  return NextResponse.json({ review });
});
