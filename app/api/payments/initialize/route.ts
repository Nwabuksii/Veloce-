import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { initializeTransaction } from "@/lib/paystack";
import { REQUEST_FULFILLED_PRICE, computeScribeCut } from "@/lib/pricing";

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
    const alreadyOwned = await prisma.purchase.findFirst({
      where: { buyerId: user.sub, noteId: note.id, refundedAt: null },
    });
    if (alreadyOwned) {
      return NextResponse.json({ error: "You already own this version" }, { status: 409 });
    }

    const reference = `veloce_${randomUUID()}`;

    // Fixed pricing is a thank-you for the student(s) who actually
    // requested this note — not a discount for every buyer of a
    // request-fulfilling block. See lib/pricing.ts and RequestVote.
    let discountApplied = false;
    let amountToCharge = block.price;

    const noteWithRequest = await prisma.note.findUnique({
      where: { id: note.id },
      select: { fulfillsRequestId: true },
    });

    if (noteWithRequest?.fulfillsRequestId) {
      const votedForIt = await prisma.requestVote.findUnique({
        where: { requestId_studentId: { requestId: noteWithRequest.fulfillsRequestId, studentId: user.sub } },
      });
      if (votedForIt) {
        discountApplied = true;
        amountToCharge = REQUEST_FULFILLED_PRICE;
      }
    }

    // Refund credit (granted per-refund, a ₦ balance — see lib schema
    // comments) is applied as a partial payment on the buyer's very next
    // purchase, up to whatever it covers — not optional, not something
    // they choose to apply. The scribe is still paid their full normal cut
    // computed off the block's real price, never off what the buyer
    // actually pays after credit; the platform absorbs the gap as the
    // cost of making the refund right. See lib/pricing.ts.
    const buyer = await prisma.user.findUnique({
      where: { id: user.sub },
      select: { creditBalance: true },
    });

    const creditAvailable = buyer?.creditBalance ?? 0;
    const creditToApply = Math.min(creditAvailable, amountToCharge);
    const remainingToCharge = amountToCharge - creditToApply;

    if (creditToApply > 0 && remainingToCharge === 0) {
      const scribeCut = computeScribeCut(amountToCharge, discountApplied);

      const [, purchase] = await prisma.$transaction([
        prisma.user.update({
          where: { id: user.sub },
          data: { creditBalance: { decrement: creditToApply } },
        }),
        prisma.purchase.create({
          data: {
            buyerId: user.sub,
            noteId: note.id,
            blockId,
            amountPaid: 0,
            discountApplied: false,
            redeemedWithCoupon: true,
            creditApplied: creditToApply,
            scribeCutOverride: scribeCut,
            paystackRef: `credit_${randomUUID()}`,
          },
        }),
      ]);

      const remainingBalance = creditAvailable - creditToApply;

      const [buyerRecord, scribe] = await Promise.all([
        prisma.user.findUnique({ where: { id: user.sub }, select: { fullName: true } }),
        prisma.user.findUnique({ where: { id: note.scribeId }, select: { id: true, fullName: true } }),
      ]);

      await prisma.adminMessage.createMany({
        data: [
          {
            recipientId: user.sub,
            senderId: null,
            subject: `Credit used — "${block.title}"`,
            body: `₦${creditToApply.toLocaleString()} of your credit was used to unlock "${block.title}". No charge — enjoy! You have ₦${remainingBalance.toLocaleString()} credit left.`,
          },
          ...(scribe
            ? [
                {
                  recipientId: scribe.id,
                  senderId: null,
                  subject: `Your version of "${block.title}" was claimed with credit`,
                  body: `${buyerRecord?.fullName ?? "A student"} unlocked your version of "${block.title}" using refund credit. You're still credited the full ₦${scribeCut.toLocaleString()} for it — the platform covers the cost of credit, not you.`,
                },
              ]
            : []),
        ],
      });

      return NextResponse.json({ freeViaCoupon: true, noteId: purchase.noteId });
    }

    // Not fully covered by credit (or no credit at all) — Paystack is
    // charged for whatever's left, and creditToApply/amountToCharge travel
    // in the metadata so the webhook/verify routes can finish the job once
    // payment actually succeeds. The credit balance is NOT decremented
    // here — only once the purchase row is actually created — so an
    // abandoned checkout never burns credit for nothing.
    // (Known edge case: two checkouts started back-to-back before either
    // completes could both reserve the same credit in their metadata,
    // since the balance isn't locked between initialize and confirm. Rare
    // enough for a low-value, per-user balance that it isn't worth a
    // reservation system for now.)
    const { authorization_url } = await initializeTransaction({
      email: user.email,
      amount: remainingToCharge,
      reference,
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/payment/callback`,
      metadata: { userId: user.sub, blockId, noteId: note.id, discountApplied, creditApplied: creditToApply, fullPrice: amountToCharge },
    });

    return NextResponse.json({ authorizationUrl: authorization_url, reference, creditApplied: creditToApply });
  } catch (err) {
    // Surface the real reason instead of letting Next.js return a generic HTML 500,
    // which is what was making the client show "Something went wrong."
    console.error("Payment initialize failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Checkout failed: ${message}` }, { status: 500 });
  }
});
