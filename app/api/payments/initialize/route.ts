import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { initializeTransaction } from "@/lib/paystack";
import { applyRequestDiscount } from "@/lib/pricing";

export const POST = requireRole("STUDENT", async (req: NextRequest, user) => {
  try {
    const { blockId, noteId } = await req.json();

    if (!blockId) {
      return NextResponse.json({ error: "blockId is required" }, { status: 400 });
    }

    const block = await prisma.block.findUnique({
      where: { id: blockId },
      include: {
        notes: noteId
          ? { where: { id: noteId, status: "LIVE" } }
          : { where: { status: "LIVE" }, orderBy: { createdAt: "asc" }, take: 1 },
      },
    });

    if (!block) {
      return NextResponse.json({ error: "Block not found" }, { status: 404 });
    }

    if (block.notes.length === 0) {
      return NextResponse.json(
        { error: noteId ? "That version is no longer available" : "No live notes available for this block yet" },
        { status: 409 }
      );
    }

    const note = block.notes[0];

    // Ownership is per-note, not per-block — a student can buy more than one
    // scribe's version of the same block, they just can't buy the exact same
    // note twice.
    const alreadyOwned = await prisma.purchase.findFirst({ where: { buyerId: user.sub, noteId: note.id } });
    if (alreadyOwned) {
      return NextResponse.json({ error: "You already own this version" }, { status: 409 });
    }

    const reference = `veloce_${randomUUID()}`;

    // Discount check: did this buyer vote on the request that this note
    // fulfills? If so, they get the request-fulfilled discount.
    let discountApplied = false;
    let amountToCharge = block.price;

    const noteWithRequest = await prisma.note.findUnique({
      where: { id: note.id },
      select: { fulfillsRequestId: true },
    });

    if (noteWithRequest?.fulfillsRequestId) {
      const vote = await prisma.requestVote.findUnique({
        where: {
          requestId_studentId: { requestId: noteWithRequest.fulfillsRequestId, studentId: user.sub },
        },
      });
      if (vote) {
        discountApplied = true;
        amountToCharge = applyRequestDiscount(block.price);
      }
    }

    const { authorization_url } = await initializeTransaction({
      email: user.email,
      amount: amountToCharge,
      reference,
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/payment/callback`,
      metadata: { userId: user.sub, blockId, noteId: note.id, discountApplied },
    });

    return NextResponse.json({ authorizationUrl: authorization_url, reference });
  } catch (err) {
    // Surface the real reason instead of letting Next.js return a generic HTML 500,
    // which is what was making the client show "Something went wrong."
    console.error("Payment initialize failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Checkout failed: ${message}` }, { status: 500 });
  }
});
