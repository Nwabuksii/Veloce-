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
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!termsAccepted) {
      setError("You must accept the Terms of Service to continue.");
      return;
    }

    setLoading(true);

    try {
      await apiFetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, password, universitySlug: UNIVERSITY_SLUG, termsAccepted }),
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
          Veloce
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
                We sent a verification link to <strong>{submittedEmail}</strong>. Click it within the next{" "}
                <strong>5 minutes</strong> to finish setting up your account — after that, the link expires and
                you'll need to sign up again.
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

                <label style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", gap: "0.5rem" }}>
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    required
                    style={{ marginTop: "0.2rem" }}
                  />
                  <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.5, fontWeight: 400 }}>
                    I agree to Veloce's{" "}
                    <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a> and{" "}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
                  </span>
                </label>

                <button className="btn btn-primary btn-block" type="submit" disabled={loading || !termsAccepted}>
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
