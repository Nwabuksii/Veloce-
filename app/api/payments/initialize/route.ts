import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { initializeTransaction } from "@/lib/paystack";
import { rateLimitResponse } from "@/lib/rate-limit";
import { sendRefundWindowEmail } from "@/lib/refund-email";
import { computeScribeCut, getBlockPriceForBuyer, planCreditRedemption } from "@/lib/pricing";

export const POST = requireRole("STUDENT", async (req: NextRequest, user) => {
  // Each call to Paystack creates a transaction on their side, so an
  // unthrottled loop here piles up abandoned checkouts (and every call is
  // a paid-for API request). Generous for real use — a buyer picking
  // several notes in a row is well under it.
  const blocked = await rateLimitResponse(
    `payment-init:${user.sub}`,
    10,
    10 * 60 * 1000,
    "Too many checkout attempts. Please wait a few minutes and try again."
  );
  if (blocked) return blocked;

  try {
    const { blockId, noteId, confirmSelfPurchase } = await req.json();

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

    // A scribe may buy their own note (it's a normal sale), but never by
    // accident: the first request is answered with 409 + a flag, the page
    // shows a confirm prompt, and only a retry carrying confirmSelfPurchase
    // goes through. Checked before any credit or Paystack work.
    if (note.scribeId === user.sub && confirmSelfPurchase !== true) {
      return NextResponse.json(
        { error: "Please confirm you want to buy your own note.", needsSelfPurchaseConfirm: true },
        { status: 409 }
      );
    }

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

    // ₦900 is a thank-you for students who voted for the request this block
    // fulfils, and applies to every version in it. See lib/pricing.ts.
    const buyerRequestedBlock = Boolean(
      await prisma.requestVote.findFirst({
        where: { studentId: user.sub, request: { blockId: block.id } },
        select: { id: true },
      })
    );
    const amountToCharge = getBlockPriceForBuyer({ basePrice: block.price, buyerRequestedBlock });
    const discountApplied = buyerRequestedBlock;

    // Refund credit is real cash Veloce already holds (see lib/pricing.ts)
    // — unlimited, never expires, leftovers carry forward — applied as a
    // partial payment on the buyer's very next purchase up to whatever it
    // covers. It is not optional and not something they choose to apply.
    const buyer = await prisma.user.findUnique({
      where: { id: user.sub },
      select: { creditBalance: true },
    });

    const creditAvailable = buyer?.creditBalance ?? 0;
    const plan = planCreditRedemption(amountToCharge, creditAvailable);
    const creditToApply = plan.creditUsed;
    const remainingToCharge = plan.cash;

    if (creditToApply > 0 && remainingToCharge === 0) {
      // This purchase's price is fully covered by credit already on
      // account — no Paystack charge needed. It still goes into escrow
      // like any other purchase (see lib/pricing.ts / lib/withdrawal.ts):
      // the scribe and platform only see this money once it clears or an
      // admin declines a refund request on it, exactly the same as a cash
      // sale. Nothing is disbursed here.
      const scribeCut = computeScribeCut(amountToCharge, discountApplied);

      // Guarded decrement, not a blind one: two near-simultaneous requests
      // (e.g. a double-click, or someone scripting this deliberately) can
      // both pass the `creditAvailable` check above off the same stale
      // read before either writes anything. updateMany's WHERE clause
      // re-checks creditBalance >= creditToApply at the moment it
      // actually acquires the row lock, inside the transaction, so the
      // second request to reach it sees the balance the first one just
      // left behind and correctly fails the check instead of decrementing
      // past zero. Without this, one refund's credit could be redeemed
      // for two (or more) free notes by simply firing concurrent
      // requests — no payment required at all, unlike the similar edge
      // case noted below for the paid path.
      const result = await prisma.$transaction(async (tx) => {
        // Same race as the credit-balance one above, different failure
        // mode: two concurrent requests for the SAME note (a double-click,
        // or two tabs) could both pass the alreadyOwned check earlier in
        // this handler before either has created a purchase — re-check it
        // here, inside the lock, so the loser aborts instead of creating a
        // second, worthless copy of a note the buyer already has.
        const alreadyOwned = await tx.purchase.findFirst({
          where: { buyerId: user.sub, noteId: note.id, refundedAt: null },
        });
        if (alreadyOwned) return null;

        const updateResult = await tx.user.updateMany({
          where: { id: user.sub, creditBalance: { gte: creditToApply } },
          data: { creditBalance: { decrement: creditToApply } },
        });
        if (updateResult.count === 0) return null;

        return tx.purchase.create({
          data: {
            buyerId: user.sub,
            noteId: note.id,
            blockId,
            amountPaid: 0,
            discountApplied,
            redeemedWithCoupon: true,
            creditApplied: creditToApply,
            paystackRef: `credit_${randomUUID()}`,
          },
        });
      });

      if (!result) {
        return NextResponse.json(
          { error: "This didn't go through — you may already own this note, or your credit balance just changed. Please refresh and try again." },
          { status: 409 }
        );
      }
      const purchase = result;

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
                  body: `${buyerRecord?.fullName ?? "A student"} unlocked your version of "${block.title}" using refund credit. Once the usual refund window passes with no issue, you'll be credited the full ₦${scribeCut.toLocaleString()} for it, same as any other sale.`,
                },
              ]
            : []),
        ],
      });

      await sendRefundWindowEmail(purchase.id);

      return NextResponse.json({ freeViaCoupon: true, noteId: purchase.noteId, purchaseId: purchase.id });
    }

    // Not fully covered by credit (or no credit at all) — Paystack is
    // charged for whatever's left, and creditToApply/amountToCharge travel
    // in the metadata so the webhook/verify routes can finish the job once
    // payment actually succeeds. The credit balance is NOT decremented
    // here — only once the purchase row is actually created — so an
    // abandoned checkout never burns credit for nothing.
    // Two checkouts started back-to-back before either completes CAN both
    // reserve the same credit in their metadata here, and/or both end up
    // genuinely paid (e.g. a retry after a network hiccup made a
    // successful charge look failed) — see lib/complete-purchase.ts for
    // how that's reconciled once a charge actually succeeds, rather than
    // trying to prevent it at reservation time here.
    const { authorization_url } = await initializeTransaction({
      email: user.email,
      amount: remainingToCharge,
      reference,
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/payment/callback`,
      metadata: { userId: user.sub, blockId, noteId: note.id, discountApplied, creditApplied: creditToApply, fullPrice: amountToCharge },
    });

    return NextResponse.json({ authorizationUrl: authorization_url, reference, creditApplied: creditToApply });
  } catch (err) {
    // Log the real reason on the server; answer with JSON (not Next.js's
    // generic HTML 500) so the client can show a proper message.
    console.error("Payment initialize failed:", err);
    // Details stay in the server log (Prisma/Paystack errors can name tables,
    // queries and keys); the client gets a plain message.
    return NextResponse.json({ error: "Checkout couldn't be started — please try again in a moment." }, { status: 500 });
  }
});
