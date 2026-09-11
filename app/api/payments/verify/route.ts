import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { verifyTransaction } from "@/lib/paystack";

export const POST = requireRole("STUDENT", async (req: NextRequest, user) => {
  try {
    const { reference } = await req.json();

    if (!reference) {
      return NextResponse.json({ error: "reference is required" }, { status: 400 });
    }

    const existing = await prisma.purchase.findUnique({ where: { paystackRef: reference } });
    if (existing) {
      return NextResponse.json({ purchase: existing });
    }

    const tx = await verifyTransaction(reference);

    if (tx.status !== "success") {
      return NextResponse.json({ error: "Payment was not successful" }, { status: 402 });
    }

    const metadata = tx.metadata as {
      userId?: string;
      blockId?: string;
      noteId?: string;
      discountApplied?: boolean;
    };

    if (!metadata?.blockId || !metadata?.noteId || metadata.userId !== user.sub) {
      return NextResponse.json({ error: "Payment metadata mismatch" }, { status: 400 });
    }

    let purchase;
    try {
      purchase = await prisma.purchase.create({
        data: {
          buyerId: user.sub,
          noteId: metadata.noteId,
          blockId: metadata.blockId,
          amountPaid: tx.amount / 100,
          discountApplied: metadata.discountApplied ?? false,
          paystackRef: reference,
        },
      });
    } catch (createErr: any) {
      // Two near-simultaneous verify calls (e.g. React double-invoking the
      // callback effect) can both pass the findUnique check above before
      // either finishes writing. If this is that duplicate, the purchase
      // already exists — treat it as success instead of an error.
      if (createErr?.code === "P2002") {
        purchase = await prisma.purchase.findUnique({ where: { paystackRef: reference } });
        if (!purchase) throw createErr;
      } else {
        throw createErr;
      }
    }

    return NextResponse.json({ purchase });
  } catch (err) {
    console.error("Payment verify failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Verification failed: ${message}` }, { status: 500 });
  }
});
