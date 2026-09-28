"use client";

import { useState, FormEvent, KeyboardEvent } from "react";
import AuthShell, { ShelfWave } from "@/app/components/AuthShell";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";

const UNIVERSITY_SLUG = "babcock";

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const [focused, setFocused] = useState(false);
  const [wave, setWave] = useState<ShelfWave>(null);
  const [waveKey, setWaveKey] = useState(0);
  const [shakeOn, setShakeOn] = useState(false);

  function playWave(kind: ShelfWave) {
    setWave(kind);
    setWaveKey((k) => k + 1);
  }

  function triggerShake() {
    setShakeOn(false);
    requestAnimationFrame(() => {
      setShakeOn(true);
      setTimeout(() => setShakeOn(false), 520);
    });
  }

  function checkCaps(e: KeyboardEvent<HTMLInputElement>) {
    if (typeof e.getModifierState === "function") setCapsOn(e.getModifierState("CapsLock"));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError("");

    if (!termsAccepted) {
      setError("You must accept the Terms of Service to continue.");
      triggerShake();
      playWave("down");
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
      playWave("up");
    } catch (err) {
      setError(friendlyErrorMessage(err));
      triggerShake();
      playWave("down");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell focused={focused} wave={wave} waveKey={waveKey}>
      {submittedEmail ? (
        <>
          <div className="va-head">
            <span className="va-eyebrow">Almost there</span>
            <h1>
              Check your <span className="serif">email</span>
            </h1>
            <p>
              We sent a verification link to <strong style={{ color: "var(--va-ink)" }}>{submittedEmail}</strong>. Click it
              within the next <strong style={{ color: "var(--va-ink)" }}>10 minutes</strong> to finish setting up your
              account — after that, the link expires and you&apos;ll need to sign up again.
            </p>
          </div>
          <p className="va-cta" style={{ marginTop: 0 }}>
            Didn&apos;t get it? Check spam, or <a href="/login">go to login</a> to resend it.
          </p>
        </>
      ) : (
        <>
          <div className="va-head">
            <span className="va-eyebrow">Create an account</span>
            <h1>
              Create your <span className="serif">account</span>
            </h1>
            <p>Sign up with your Babcock details.</p>
          </div>

          <div className={shakeOn ? "va-shake" : undefined}>
            <form className="va-form" onSubmit={handleSubmit}>
              <div className="va-field">
                <input
                  type="text"
                  id="fullName"
                  placeholder=" "
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  required
                />
                <label htmlFor="fullName">Full name</label>
              </div>

              <div className="va-field">
                <input
                  type="email"
                  id="email"
                  placeholder=" "
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  required
                />
                <label htmlFor="email">Email address</label>
              </div>

              <div className="va-field">
                <input
                  type={showPw ? "text" : "password"}
                  id="password"
                  placeholder=" "
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={checkCaps}
                  onKeyUp={checkCaps}
                  onFocus={() => setFocused(true)}
                  onBlur={() => { setFocused(false); setCapsOn(false); }}
                  minLength={8}
                  required
                />
                <label htmlFor="password">Password</label>
                <button
                  type="button"
                  className="va-toggle"
                  aria-label={showPw ? "Hide password" : "Show password"}
                  onClick={() => setShowPw((s) => !s)}
                >
                  {showPw ? (
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      <path d="M10.6 6.1A9.9 9.9 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3.2 3.8M6.5 6.7C4.3 8.2 2.5 12 2.5 12s3.5 6 9.5 6c1.6 0 3-.5 4.3-1.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.7" />
                    </svg>
                  )}
                </button>
                {capsOn && (
                  <span className="va-caps">
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M12 4l7 8h-4v5h-6v-5H5l7-8z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                    </svg>
                    Caps Lock is on
                  </span>
                )}
              </div>

              {/* Terms checkbox — same wording and links as the original site */}
              <div className="va-row" style={{ margin: "2px 0 8px" }}>
                <label className="va-remember va-terms">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    required
                  />
                  <span className="va-check">
                    <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.2l2.6 2.6L10 3.4" /></svg>
                  </span>
                  <span>
                    I agree to Veloce&apos;s{" "}
                    <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a> and{" "}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
                  </span>
                </label>
              </div>

              {error && <div className="va-error" role="alert">{error}</div>}

              <button
                type="submit"
                className={`va-btn${loading ? " is-loading" : ""}`}
                disabled={loading || !termsAccepted}
              >
                <span className="va-label">{loading ? "Creating account..." : "Create account"}</span>
                <svg className="va-arrow" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M4 10h11M11 5.5l4.5 4.5-4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="va-spinner" aria-hidden="true" />
              </button>
            </form>
          </div>

          <p className="va-cta">
            Already have an account? <a href="/login">Sign in</a>
          </p>
        </>
      )}
    </AuthShell>
  );
}
