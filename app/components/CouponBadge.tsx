"use client";

/**
 * Always visible on the dashboard, styled like a Minecraft player nametag —
 * a small dark floating pill. Shows the live refund-credit balance (in ₦,
 * granted per-refund, spent automatically as a partial or full payment on
 * the buyer's next purchase — see app/api/payments/initialize/route.ts).
 * Takes the balance as a prop rather than fetching itself, so the parent
 * page can reuse the exact same value to also change buy-button labels
 * (see dashboard).
 */
export default function CouponBadge({ creditBalance }: { creditBalance: number | null }) {
  if (!creditBalance) return null;

  return (
    <span className="nametag" title="Refund credit — applied automatically toward your next purchase">
      <i className="fas fa-ticket"></i>
      <span className="nametag-count">₦{creditBalance.toLocaleString()}</span>
    </span>
  );
}
