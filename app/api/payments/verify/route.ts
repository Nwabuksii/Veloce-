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

    // Scoped to the caller: a reference that belongs to someone else must not
    // hand back their purchase. For anyone else's reference this now finds
    // nothing, falls through to the Paystack check, and is rejected by the
    // metadata.userId comparison below without revealing that it exists.
    const existing = await prisma.purchase.findFirst({ where: { paystackRef: reference, buyerId: user.sub } });
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

    const result = await completePurchase({
      reference,
      amountPaid: tx.amount / 100,
      buyerId: user.sub,
      noteId: metadata.noteId,
      blockId: metadata.blockId,
      discountApplied: metadata.discountApplied ?? false,
      creditApplied: metadata.creditApplied ?? 0,
    });

    return NextResponse.json({ purchase: result.purchase, convertedToCredit: result.convertedToCredit });
  } catch (err) {
    console.error("Payment verify failed:", err);
    return NextResponse.json({ error: "We couldn't verify this payment yet — please try again in a moment." }, { status: 500 });
  }
});
