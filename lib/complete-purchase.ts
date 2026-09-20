import { prisma } from "@/lib/prisma";
import { computeScribeCutForCreditRedemption } from "@/lib/pricing";

interface CompletePurchaseParams {
  reference: string; // Paystack's reference for THIS charge
  amountPaid: number; // actual cash charged for THIS reference (naira, not kobo)
  buyerId: string;
  noteId: string;
  blockId: string;
  discountApplied: boolean;
  creditApplied: number; // how much credit this specific checkout reserved, per its own metadata
}

// The one place a Purchase row is actually created from a successful
// Paystack charge — called from both /api/payments/verify (the normal,
// browser-driven path) and the charge.success webhook (the backup path
// that fires even if the buyer's browser never makes it back). Both call
// this instead of duplicating the logic, so a fix here covers both at once.
//
// Handles two distinct kinds of "this reference was already dealt with":
//   1. Same reference seen twice (e.g. verify and the webhook both racing
//      to handle the identical charge) — Purchase.paystackRef is unique,
//      so the second writer's INSERT fails with P2002 and this just
//      returns the row the first writer already created.
//   2. Same NOTE, but a genuinely different, separately-paid-for reference
//      — e.g. the buyer double-clicked "Buy" before it could disable
//      itself, or retried after a network hiccup made a successful charge
//      look like it had failed. Nothing stops that second checkout from
//      also being genuinely charged by Paystack, so simply refusing to
//      create a purchase for it would take the buyer's money and give
//      them nothing. Instead: don't create a second copy of a note they
//      already own, but DO turn the fresh cash from this charge into
//      spendable credit, and tell them what happened.
export async function completePurchase(params: CompletePurchaseParams) {
  const { reference, amountPaid, buyerId, noteId, blockId, discountApplied, creditApplied } = params;

  try {
    return await prisma.$transaction(async (tx) => {
      const alreadyOwned = await tx.purchase.findFirst({
        where: { buyerId, noteId, refundedAt: null, paystackRef: { not: reference } },
      });

      if (alreadyOwned) {
        // The credit this checkout had reserved (if any) was never
        // actually decremented anywhere — only amountPaid is genuinely
        // new money on top of whatever balance already exists, so only
        // that gets added. Crediting creditApplied too would hand back
        // spendable value the buyer never lost in the first place.
        await tx.user.update({
          where: { id: buyerId },
          data: { creditBalance: { increment: amountPaid } },
        });

        if (amountPaid > 0) {
          await tx.adminMessage.create({
            data: {
              recipientId: buyerId,
              senderId: null,
              subject: "You already owned this — refunded as credit",
              body: `You already had access to this note from an earlier purchase, so this second payment wasn't charged as a duplicate. Your ₦${amountPaid.toLocaleString()} has been added to your credit balance instead — it'll apply automatically to your next purchase.`,
            },
          });
        }

        return alreadyOwned;
      }

      if (creditApplied > 0) {
        await tx.user.update({ where: { id: buyerId }, data: { creditBalance: { decrement: creditApplied } } });
      }

      return await tx.purchase.create({
        data: {
          buyerId,
          noteId,
          blockId,
          amountPaid,
          discountApplied,
          creditApplied,
          redeemedWithCoupon: creditApplied > 0,
          // Fixed, never price/discount-based — see lib/pricing.ts. This is
          // a reassignment of the cut already reclaimed on the refunded
          // sale that generated this credit, not a new price-dependent payout.
          scribeCutOverride: creditApplied > 0 ? computeScribeCutForCreditRedemption() : null,
          paystackRef: reference,
        },
      });
    });
  } catch (err: any) {
    if (err?.code === "P2002") {
      const existing = await prisma.purchase.findUnique({ where: { paystackRef: reference } });
      if (existing) return existing;
    }
    throw err;
  }
}
