import * as Sentry from "@sentry/nextjs";
import type { Payout, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateReceiptImage } from "@/lib/receipt";
import { sendEmail } from "@/lib/email";
import { logSecurityEvent } from "@/lib/security-log";

// Everything that turns a Paystack transfer result into a payout status —
// shared by the transfer webhook and the admin "check with Paystack" route,
// so both apply exactly the same rules.
//
// Why this exists: Paystack delivers webhooks at-least-once, and out of order
// is possible. The old webhook wrote PAID/FAILED unconditionally, so a
// replayed `transfer.success` re-sent the receipt email, and a late
// `transfer.failed` could overwrite a payout that had already been paid —
// which frees the scribe's balance while the money has left (the scribe
// withdraws it twice).

export type TransferOutcome = "success" | "failed" | "reversed";
type PayoutStatus = Payout["status"];

/** Paystack's transfer status → an outcome we act on, or null while it's still in flight. */
export function outcomeFromPaystackStatus(status: string | undefined): TransferOutcome | null {
  if (status === "success") return "success";
  if (status === "failed") return "failed";
  if (status === "reversed") return "reversed";
  return null; // pending / processing / received / otp — nothing to settle yet
}

/**
 * The status a payout may move to for this outcome, or null when the event
 * must be ignored:
 *   success  : PROCESSING -> PAID
 *   failed   : PROCESSING -> FAILED
 *   reversed : PROCESSING or PAID -> FAILED (Paystack returned money that
 *              had been sent)
 * Anything else — an event replayed after the payout already settled, or one
 * that contradicts what we know — changes nothing.
 */
export function settlementTarget(current: PayoutStatus, outcome: TransferOutcome): "PAID" | "FAILED" | null {
  if (outcome === "success") return current === "PROCESSING" ? "PAID" : null;
  if (outcome === "failed") return current === "PROCESSING" ? "FAILED" : null;
  return current === "PROCESSING" || current === "PAID" ? "FAILED" : null;
}

export interface SettleResult {
  /** True only for the caller whose update actually changed the payout. */
  applied: boolean;
  to: "PAID" | "FAILED" | null;
}

export async function settlePayout(
  payout: Pick<Payout, "id" | "status">,
  outcome: TransferOutcome,
  failureReason: string | undefined,
  source: "webhook" | "reconcile"
): Promise<SettleResult> {
  const to = settlementTarget(payout.status, outcome);
  if (!to) {
    // A success arriving for a payout we already marked FAILED means money
    // moved that we told the scribe hadn't — needs a human.
    const contradiction = outcome === "success" && payout.status === "FAILED";
    await logSecurityEvent(
      "webhook_replay_ignored",
      { payoutId: payout.id, outcome, currentStatus: payout.status, source },
      contradiction ? "alert" : "info"
    );
    return { applied: false, to: null };
  }

  // Guarded on the status we read, so two deliveries of the same event (or a
  // webhook racing a manual check) can't both apply: only one update matches.
  const claim = await prisma.payout.updateMany({
    where: { id: payout.id, status: payout.status },
    data: to === "PAID" ? { status: "PAID", paidAt: new Date() } : { status: "FAILED", failureReason: failureReason ?? outcome },
  });
  if (claim.count !== 1) return { applied: false, to: null };

  await logSecurityEvent("payout_settled", { payoutId: payout.id, from: payout.status, to, source }, "info");
  return { applied: true, to };
}

/** Best-effort receipt email — a failure never changes the payout's status. */
export async function sendPayoutReceipt(payout: Payout & { scribe: User }, paidAt: Date): Promise<void> {
  try {
    const { scribe } = payout;
    const receiptImage = await generateReceiptImage({
      scribeName: scribe.fullName,
      amount: payout.amount,
      date: paidAt,
      reference: payout.id,
      bankName: scribe.bankName || "N/A",
      accountLast4: scribe.accountNumber?.slice(-4) || "----",
    });

    await sendEmail({
      to: scribe.email,
      subject: "Your Veloce withdrawal has been paid",
      text: `Your withdrawal of \u20a6${payout.amount.toLocaleString()} has been sent. See the attached receipt for details.`,
      html: `<p>Your withdrawal of \u20a6${payout.amount.toLocaleString()} has been sent. See the attached receipt for details.</p>`,
      attachments: [{ filename: "veloce-receipt.png", content: receiptImage, mimetype: "image/png" }],
    });
  } catch (err) {
    console.error("Failed to send payout receipt email:", err);
    Sentry.captureException(err, { extra: { payoutId: payout.id, context: "payout-receipt-email" } });
  }
}
