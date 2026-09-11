"use client";

import { useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Logo from "@/app/components/Logo";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("");

    if (!token) {
      setStatus("Missing reset link — check the link in your email is complete.");
      return;
    }
    if (newPassword !== confirm) {
      setStatus("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const data = await apiFetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      setStatus(data.message);
      setDone(true);
      setTimeout(() => router.push("/login"), 1500);
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
          <h1>Choose a new password</h1>

          {!done ? (
            <form onSubmit={handleSubmit}>
              <label>
                New password
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </label>
              <label>
                Confirm new password
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  minLength={8}
                  required
                />
              </label>

              {status && <div className="auth-error">{status}</div>}

              <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
                {loading ? "Saving..." : "Reset password"}
              </button>
            </form>
          ) : (
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>{status}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
