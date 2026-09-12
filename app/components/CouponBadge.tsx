"use client";

/**
 * Always visible on the dashboard, styled like a Minecraft player nametag —
 * a small dark floating pill. Shows the live coupon balance (granted
 * 1-per-successful-refund, auto-spent on the next purchase). Takes count
 * as a prop rather than fetching itself, so the parent page can reuse the
 * exact same balance to also change buy-button labels (see dashboard).
 */
export default function CouponBadge({ count }: { count: number | null }) {
  if (count === null) return null;

  return (
    <span className="nametag" title="Coupons — used automatically on your next purchase">
      <i className="fas fa-ticket"></i>
      <span className="nametag-count">{count}</span>
    </span>
  );
}
