"use client";

interface CouponConfirmDialogProps {
  itemLabel: string;
  confirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Shown right before a coupon-funded purchase actually goes through — a
 * coupon purchase skips Paystack entirely, so there's no external checkout
 * page giving the person a natural "wait, was that a mistake?" moment.
 * This dialog is that moment instead.
 */
export default function CouponConfirmDialog({ itemLabel, confirming, onConfirm, onCancel }: CouponConfirmDialogProps) {
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
          borderRadius: "16px",
          padding: "1.5rem",
          width: "min(380px, 90vw)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <i className="fas fa-ticket" style={{ color: "var(--text-pro)" }}></i> Use your coupon?
        </h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
          This uses your 1 coupon to unlock <strong>{itemLabel}</strong> for free — no charge. Your coupon balance
          drops to 0 either way, so make sure this is the one you want.
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
