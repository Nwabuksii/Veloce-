"use client";

interface CouponConfirmDialogProps {
  itemLabel: string;
  price: number;
  creditBalance: number;
  confirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Shown right before a purchase applies the buyer's refund credit — a
 * fully-covered purchase skips Paystack entirely, so there's no external
 * checkout page giving the person a natural "wait, was that a mistake?"
 * moment. This dialog is that moment either way, whether credit covers
 * the whole price or just part of it.
 *
 * creditBalance is the balance BEFORE this purchase — credit only ever
 * covers up to the item's price, so however much is left over carries
 * forward untouched.
 */
export default function CouponConfirmDialog({ itemLabel, price, creditBalance, confirming, onConfirm, onCancel }: CouponConfirmDialogProps) {
  const creditToApply = Math.min(creditBalance, price);
  const remainingToPay = price - creditToApply;
  const remainingCredit = creditBalance - creditToApply;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--overlay)",
        backdropFilter: "blur(4px)",
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
          borderRadius: "1rem",
          border: "1px solid var(--border)",
          boxShadow: "var(--menu-shadow)",
          padding: "1.5rem",
          width: "min(380px, 90vw)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <i className="fas fa-ticket" style={{ color: "var(--text-pro)" }}></i> Use your credit?
        </h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
          This applies ₦{creditToApply.toLocaleString()} of your ₦{creditBalance.toLocaleString()} credit toward{" "}
          <strong>{itemLabel}</strong> (₦{price.toLocaleString()}).{" "}
          {remainingToPay === 0
            ? "No charge — it's fully covered."
            : `You'll still pay ₦${remainingToPay.toLocaleString()} via Paystack.`}{" "}
          You'll have ₦{remainingCredit.toLocaleString()} credit left after this.
        </p>
        <div style={{ display: "flex", gap: "0.6rem", marginTop: "1.2rem" }}>
          <button className="btn btn-primary press-on-tap" disabled={confirming} onClick={onConfirm}>
            {confirming ? "Processing..." : "Yes, apply credit"}
          </button>
          <button className="btn" type="button" onClick={onCancel} disabled={confirming}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
