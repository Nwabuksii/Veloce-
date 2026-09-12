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

    // Any note that fulfills a student request is always sold at the
    // founder-fixed price, for every buyer — not conditional on whether
    // this particular buyer voted for the request. See lib/pricing.ts.
    let discountApplied = false;
    let amountToCharge = block.price;

    const noteWithRequest = await prisma.note.findUnique({
      where: { id: note.id },
      select: { fulfillsRequestId: true },
    });

    if (noteWithRequest?.fulfillsRequestId) {
      discountApplied = true;
      amountToCharge = REQUEST_FULFILLED_PRICE;
    }

    // A coupon (granted 1-per-successful-refund) is spent automatically on
    // the buyer's very next purchase — not optional, not something they
    // choose to apply. The scribe is still paid in full for the version
    // they buy; the platform absorbs the ₦0 collected here as the cost of
    // making the refund right. See lib/pricing.ts.
    const buyer = await prisma.user.findUnique({
      where: { id: user.sub },
      select: { couponBalance: true },
    });

    if (buyer && buyer.couponBalance > 0) {
      const scribeCut = computeScribeCut(amountToCharge, discountApplied);

      const [, purchase] = await prisma.$transaction([
        prisma.user.update({
          where: { id: user.sub },
          data: { couponBalance: { decrement: 1 } },
        }),
        prisma.purchase.create({
          data: {
            buyerId: user.sub,
            noteId: note.id,
            blockId,
            amountPaid: 0,
            discountApplied: false,
            redeemedWithCoupon: true,
            scribeCutOverride: scribeCut,
            paystackRef: `coupon_${randomUUID()}`,
          },
        }),
      ]);

      const [buyerRecord, scribe] = await Promise.all([
        prisma.user.findUnique({ where: { id: user.sub }, select: { fullName: true } }),
        prisma.user.findUnique({ where: { id: note.scribeId }, select: { id: true, fullName: true } }),
      ]);

      await prisma.adminMessage.createMany({
        data: [
          {
            recipientId: user.sub,
            senderId: null,
            subject: `Coupon used — "${block.title}"`,
            body: `Your coupon was used to unlock "${block.title}". No charge — enjoy! You have ${buyer.couponBalance - 1} coupon${buyer.couponBalance - 1 === 1 ? "" : "s"} left.`,
          },
          ...(scribe
            ? [
                {
                  recipientId: scribe.id,
                  senderId: null,
                  subject: `Your version of "${block.title}" was claimed with a coupon`,
                  body: `${buyerRecord?.fullName ?? "A student"} unlocked your version of "${block.title}" using a coupon. You're still credited the full ₦${scribeCut.toLocaleString()} for it — the platform covers the cost of coupons, not you.`,
                },
              ]
            : []),
        ],
      });

      return NextResponse.json({ freeViaCoupon: true, noteId: purchase.noteId });
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
