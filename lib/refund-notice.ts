import { REFUND_WINDOW_MINUTES } from "@/lib/pricing";

// One set of words for the refund reminder, so the confirmation screen, the
// banner and the email never disagree about the time limit or where to go.
export const REFUND_LOCATION = "Library → find the note → Request refund";

export const REFUND_NOTICE_SHORT = `Not what you expected? You can request a refund within ${REFUND_WINDOW_MINUTES} minutes of buying.`;

export const REFUND_NOTICE_STEPS = [
  `Open Library from the menu at the top.`,
  `Find the note you just bought and tap "Request refund".`,
  `Tell us what went wrong and send it. An admin reviews it, and an approved refund comes back as credit for your next purchase.`,
];

export const REFUND_NOTICE_DEADLINE = `After ${REFUND_WINDOW_MINUTES} minutes the refund window closes and a refund can no longer be requested.`;

export const refundUrl = (purchaseId: string) => `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/purchases?refund=${encodeURIComponent(purchaseId)}`;

export function minutesLeftLabel(msLeft: number): string {
  if (msLeft <= 0) return "0 min";
  if (msLeft < 60_000) return "under 1 min";
  return `${Math.ceil(msLeft / 60_000)} min`;
}
