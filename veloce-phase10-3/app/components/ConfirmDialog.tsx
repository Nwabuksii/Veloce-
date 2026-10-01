"use client";

import { ReactNode, useEffect } from "react";

interface ConfirmDialogProps {
  title: string;
  children: ReactNode; // the explanation
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The site's own "are you sure?" box — same look as CouponConfirmDialog —
 * for use instead of the browser's window.confirm(). Escape or a click on
 * the backdrop cancels.
 */
export default function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  busy = false,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div
      role="presentation"
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
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        style={{
          background: "var(--surface)",
          borderRadius: "1rem",
          border: "1px solid var(--border)",
          boxShadow: "var(--menu-shadow)",
          padding: "1.5rem",
          width: "min(400px, 90vw)",
          maxHeight: "calc(100dvh - 3rem)",
          overflowY: "auto",
          overscrollBehavior: "contain",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-dialog-title" style={{ marginTop: 0 }}>
          {title}
        </h3>
        <div style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.55 }}>{children}</div>
        <div style={{ display: "flex", gap: "0.6rem", marginTop: "1.2rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className={`btn ${danger ? "btn-danger" : "btn-primary"} press-on-tap`}
            disabled={busy}
            onClick={onConfirm}
            autoFocus
          >
            {busy ? "Working..." : confirmLabel}
          </button>
          <button className="btn" type="button" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
