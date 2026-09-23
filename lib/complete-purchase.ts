import type { Prisma, Purchase } from "@prisma/client";
import { prisma } from "@/lib/prisma";

interface CompletePurchaseParams {
  reference: string; // Paystack's reference for THIS charge
  amountPaid: number; // actual cash charged for THIS reference (naira, not kobo)
  buyerId: string;
  noteId: string;
  blockId: string;
  discountApplied: boolean;
  creditApplied: number; // how much credit this specific checkout reserved, per its own metadata
}

export interface CompletePurchaseResult {
  /** The purchase the buyer now has access to (null if this charge only became credit and they don't own the note). */
  purchase: Purchase | null;
  /** True when the charge was turned into credit instead of creating a purchase. */
  convertedToCredit: boolean;
}

// The one place a Purchase row is actually created from a successful
// Paystack charge — called from both /api/payments/verify (the normal,
// browser-driven path) and the charge.success webhook (the backup path
// that fires even if the buyer's browser never makes it back). Both call
// this instead of duplicating the logic, so a fix here covers both at once.
//
// Note what this does NOT do: split anything between the scribe and the
// platform. Under the escrow model (see lib/pricing.ts), a fresh purchase
// isn't anyone's money yet — it clears on its own after the hold window,
// or is fully refunded as credit if the buyer asks in time. This function
// only ever records that the charge happened and grants access; resolution
// happens later, read at query time by lib/withdrawal.ts and lib/finance.ts.
//
// A charge can end in one of three ways, and every one of them is safe to
// run twice for the same reference (verify and the webhook BOTH report every
// payment, so they always do):
//   1. A normal purchase — Purchase.paystackRef is unique, so the second
//      writer's INSERT fails with P2002 and this returns the first one's row.
//   2. Turned into credit because the buyer already owns the note (they
//      paid twice) — recorded in ConvertedPayment, whose unique paystackRef
//      means the credit can only ever be granted ONCE per charge.
//   3. Turned into credit because the credit this checkout reserved was
//      spent elsewhere before it finished paying — same ConvertedPayment
//      guard, and the buyer just retries with what they now have.
// In both credit cases the charge's cash goes to credit in full, dollar for
// dollar — it was never a sale, so there's nothing to split.
export async function completePurchase(params: CompletePurchaseParams): Promise<CompletePurchaseResult> {
  const { reference, amountPaid, buyerId, noteId, blockId, discountApplied, creditApplied } = params;

  async function convertToCredit(tx: Prisma.TransactionClient, reason: "DUPLICATE" | "CREDIT_CHANGED", message: { subject: string; body: string }) {
    await tx.convertedPayment.create({ data: { paystackRef: reference, userId: buyerId, amount: amountPaid, reason } });
    await tx.user.update({ where: { id: buyerId }, data: { creditBalance: { increment: amountPaid } } });
    if (amountPaid > 0) {
      await tx.adminMessage.create({ data: { recipientId: buyerId, senderId: null, subject: message.subject, body: message.body } });
    }
  }

  try {
    return await prisma.$transaction(async (tx): Promise<CompletePurchaseResult> => {
      // Already handled this exact charge (the other of verify/webhook got here first).
      const alreadyConverted = await tx.convertedPayment.findUnique({ where: { paystackRef: reference } });
      if (alreadyConverted) {
        const owned = await tx.purchase.findFirst({ where: { buyerId, noteId, refundedAt: null } });
        return { purchase: owned, convertedToCredit: true };
      }

      const alreadyOwned = await tx.purchase.findFirst({
        where: { buyerId, noteId, refundedAt: null, paystackRef: { not: reference } },
      });

      if (alreadyOwned) {
        // The credit this checkout had reserved (if any) was never actually
        // decremented anywhere — only amountPaid is genuinely new money.
        await convertToCredit(tx, "DUPLICATE", {
          subject: "You already owned this — refunded as credit",
          body: `You already had access to this note from an earlier purchase, so this second payment wasn't charged as a duplicate. Your ₦${amountPaid.toLocaleString()} has been added to your credit balance instead — it'll apply automatically to your next purchase.`,
        });
        return { purchase: alreadyOwned, convertedToCredit: true };
      }

      // The credit this checkout applied was only "reserved" when checkout
      // started, so it may have been spent in the meantime — take it with a
      // guarded update. If it's no longer there, don't apply it: turn the
      // cash into credit instead and let them retry with what they now have.
      if (creditApplied > 0) {
        const taken = await tx.user.updateMany({
          where: { id: buyerId, creditBalance: { gte: creditApplied } },
          data: { creditBalance: { decrement: creditApplied } },
        });

        if (taken.count === 0) {
          await convertToCredit(tx, "CREDIT_CHANGED", {
            subject: "Your credit changed while you were paying",
            body: `Your credit balance changed while this payment was going through, so it couldn't be applied to the note. Your ₦${amountPaid.toLocaleString()} payment has been added to your credit balance instead — just unlock the note again and it'll apply automatically.`,
          });
          return { purchase: null, convertedToCredit: true };
        }
      }

      const purchase = await tx.purchase.create({
        data: {
          buyerId,
          noteId,
          blockId,
          amountPaid,
          discountApplied,
          creditApplied,
          redeemedWithCoupon: creditApplied > 0,
          paystackRef: reference,
        },
      });
      return { purchase, convertedToCredit: false };
    });
  } catch (err: any) {
    // Two writers raced on the same reference (verify + webhook at once):
    // the loser's whole transaction rolled back, so hand back what the winner did.
    if (err?.code === "P2002") {
      const existing = await prisma.purchase.findUnique({ where: { paystackRef: reference } });
      if (existing) return { purchase: existing, convertedToCredit: false };

      const converted = await prisma.convertedPayment.findUnique({ where: { paystackRef: reference } });
      if (converted) {
        const owned = await prisma.purchase.findFirst({ where: { buyerId, noteId, refundedAt: null } });
        return { purchase: owned, convertedToCredit: true };
      }
    }
    throw err;
  }
}
