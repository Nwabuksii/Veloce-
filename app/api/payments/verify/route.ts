import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { verifyTransaction } from "@/lib/paystack";
import { completePurchase } from "@/lib/complete-purchase";

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
      creditApplied?: number;
      fullPrice?: number;
    };

    if (!metadata?.blockId || !metadata?.noteId || metadata.userId !== user.sub) {
      return NextResponse.json({ error: "Payment metadata mismatch" }, { status: 400 });
    }

    const purchase = await completePurchase({
      reference,
      amountPaid: tx.amount / 100,
      buyerId: user.sub,
      noteId: metadata.noteId,
      blockId: metadata.blockId,
      discountApplied: metadata.discountApplied ?? false,
      creditApplied: metadata.creditApplied ?? 0,
    });

    return NextResponse.json({ purchase });
  } catch (err) {
    console.error("Payment verify failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Verification failed: ${message}` }, { status: 500 });
  }
});
