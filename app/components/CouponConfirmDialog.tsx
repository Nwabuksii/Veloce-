"use client";

interface CouponConfirmDialogProps {
  itemLabel: string;
  couponBalance: number;
  confirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Shown right before a coupon-funded purchase actually goes through — a
 * coupon purchase skips Paystack entirely, so there's no external checkout
 * page giving the person a natural "wait, was that a mistake?" moment.
 * This dialog is that moment instead.
 *
 * couponBalance is the count BEFORE this purchase — coupons aren't capped
 * at 1 (two separate successful refunds genuinely give two coupons), so
 * the remaining-after-use figure has to be computed from the real balance,
 * not assumed to always land on 0.
 */
export default function CouponConfirmDialog({ itemLabel, couponBalance, confirming, onConfirm, onCancel }: CouponConfirmDialogProps) {
  const remaining = Math.max(0, couponBalance - 1);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(11,30,51,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "var(--surface)",
          borderRadius: "12px",
          padding: "1.5rem",
          width: "min(380px, 90vw)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <i className="fas fa-ticket" style={{ color: "var(--text-pro)" }}></i> Use a coupon?
        </h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
          This uses 1 of your {couponBalance} coupon{couponBalance === 1 ? "" : "s"} to unlock{" "}
          <strong>{itemLabel}</strong> for free — no charge. You'll have {remaining} left after this.
        </p>
        <div style={{ display: "flex", gap: "0.6rem", marginTop: "1.2rem" }}>
          <button className="btn btn-primary press-on-tap" disabled={confirming} onClick={onConfirm}>
            {confirming ? "Unlocking..." : "Yes, use coupon"}
          </button>
          <button className="btn" type="button" onClick={onCancel} disabled={confirming}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
