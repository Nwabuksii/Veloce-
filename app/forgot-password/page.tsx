"use client";

import { useState, FormEvent } from "react";
import Logo from "@/app/components/Logo";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("");
    setLoading(true);

    try {
      const data = await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setStatus(data.message);
      setSubmitted(true);
    } catch (err) {
      setStatus(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="split-auth-page">
      <div className="split-auth-left">
        <div className="split-auth-logo-wrap">
          <Logo size={150} />
        </div>
        <div className="split-auth-brand">
          Veloce <span>.</span>
        </div>
      </div>

      <div className="split-auth-right">
        <div className="auth-card">
          <h1>Reset your password</h1>
          <p className="auth-sub">Enter your account email and we'll send you a reset link.</p>

          {!submitted ? (
            <form onSubmit={handleSubmit}>
              <label>
                Email
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>

              <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
                {loading ? "Sending..." : "Send reset link"}
              </button>
            </form>
          ) : (
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>{status}</p>
          )}

          {status && !submitted && <div className="auth-error">{status}</div>}

          <p className="auth-switch">
            <a href="/login">Back to login</a>
          </p>
        </div>
      </div>
    </div>
  );
}
