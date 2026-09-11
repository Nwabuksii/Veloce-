"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/app/components/Logo";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";

const UNIVERSITY_SLUG = "babcock";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await apiFetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, password, universitySlug: UNIVERSITY_SLUG }),
      });

      // Account isn't logged in yet — it only becomes real once the
      // verification link (sent to their inbox) is clicked.
      setSubmittedEmail(email);
    } catch (err) {
      setError(friendlyErrorMessage(err));
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
        <p className="split-auth-tagline">
          Join Babcock's own marketplace for course notes — buy, sell, and never scramble for notes again.
        </p>
      </div>

      <div className="split-auth-right">
        <div className="auth-card">
          {submittedEmail ? (
            <>
              <h1>Check your email</h1>
              <p className="auth-sub">
                We sent a verification link to <strong>{submittedEmail}</strong>. Click it to finish setting up
                your account — you won't be able to log in until you do.
              </p>
              <p className="auth-switch">
                Didn't get it? Check spam, or <a href="/login">go to login</a> to resend it.
              </p>
            </>
          ) : (
            <>
              <h1>Create your account</h1>
              <p className="auth-sub">Sign up with your Babcock details</p>

              <form onSubmit={handleSubmit}>
                <label>
                  Full name
                  <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </label>
                <label>
                  Email
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </label>

                {error && <div className="auth-error">{error}</div>}

                <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
                  {loading ? "Creating account..." : "Sign up"}
                </button>
              </form>

              <p className="auth-switch">
                Already have an account? <a href="/login">Log in</a>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
