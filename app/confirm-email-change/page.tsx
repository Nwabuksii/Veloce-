"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Logo from "@/app/components/Logo";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";

// The email link opens this page; nothing happens until the button is
// pressed (email scanners that pre-open links must not spend the link).
function Inner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("Press the button to finish changing the email on your Veloce account.");
  const [failed, setFailed] = useState(!token);

  async function submit() {
    if (!token || busy) return;
    setBusy(true);
    try {
      const data = await apiFetch("/api/auth/confirm-email-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      setMessage(data.message);
      setDone(true);
      setFailed(false);
    } catch (err) {
      setMessage(friendlyErrorMessage(err));
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="split-auth-page">
      <div className="split-auth-left">
        <div className="split-auth-logo-wrap">
          <Logo size={150} />
        </div>
        <div className="split-auth-brand">Veloce</div>
      </div>

      <div className="split-auth-right">
        <div className="auth-card">
          <h1>Confirm your new email</h1>
          <p className="auth-sub">{!token ? "This link is incomplete. Open the full link from your email." : message}</p>
          {token && !done && !failed && (
            <button className="btn btn-primary" type="button" onClick={submit} disabled={busy}>
              {busy ? "Working..." : "Confirm new email"}
            </button>
          )}
          {(done || failed) && (
            <p className="auth-switch">
              <a href="/login">Go to login</a>
              {failed ? ", then start the change again from Settings." : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ConfirmEmailChangePage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
