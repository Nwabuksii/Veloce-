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
  const [message, setMessage] = useState("If you did not ask to change your Veloce email, press the button. We will cancel the change (or put your old email back) and sign every device out.");
  const [failed, setFailed] = useState(!token);

  async function submit() {
    if (!token || busy) return;
    setBusy(true);
    try {
      const data = await apiFetch("/api/auth/revert-email-change", {
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
          <h1>This wasn't me</h1>
          <p className="auth-sub">{!token ? "This link is incomplete. Open the full link from your email." : message}</p>
          {token && !done && !failed && (
            <button className="btn btn-primary" type="button" onClick={submit} disabled={busy}>
              {busy ? "Working..." : "Yes, this wasn't me"}
            </button>
          )}
          {(done || failed) && (
            <p className="auth-switch">
              Next, <a href="/forgot-password">reset your password</a> so whoever tried cannot get back in.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EmailChangeNotMePage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
