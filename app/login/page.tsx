"use client";

import { useState, FormEvent, KeyboardEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { clearAcademicProfile, saveUser } from "@/lib/client-session";
import { applyTheme } from "@/lib/theme";
import AuthShell, { ShelfWave } from "@/app/components/AuthShell";
import { apiFetch, friendlyErrorMessage, ApiError } from "@/lib/api-client";

// Only ever redirect to a relative, same-app path (starts with a single
// "/", never "//" which browsers treat as protocol-relative to another
// host) — otherwise a crafted ?returnTo= could send someone off-site right
// after they log in.
function safeReturnTo(raw: string | null): string {
  if (!raw) return "/dashboard";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/dashboard";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendStatus, setResendStatus] = useState("");
  const [resending, setResending] = useState(false);

  const [focused, setFocused] = useState(false);
  const [wave, setWave] = useState<ShelfWave>(null);
  const [waveKey, setWaveKey] = useState(0);
  const [shakeOn, setShakeOn] = useState(false);

  function triggerShake() {
    setShakeOn(false);
    requestAnimationFrame(() => {
      setShakeOn(true);
      setTimeout(() => setShakeOn(false), 520);
    });
  }

  function playWave(kind: ShelfWave) {
    setWave(kind);
    setWaveKey((k) => k + 1);
  }

  function checkCaps(e: KeyboardEvent<HTMLInputElement>) {
    if (typeof e.getModifierState === "function") setCapsOn(e.getModifierState("CapsLock"));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading || success) return;
    setError("");
    setNeedsVerification(false);
    setResendStatus("");

    if (!EMAIL_RE.test(email.trim()) || !password) {
      setError(!EMAIL_RE.test(email.trim()) ? "Enter a valid email address." : "Enter your password.");
      triggerShake();
      playWave("down");
      return;
    }

    setLoading(true);

    try {
      const data = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      clearAcademicProfile();
      saveUser({
        ...data.user,
        departmentId: data.user.departmentId ?? null,
        level: data.user.level ?? null,
      });
      applyTheme(data.user.theme === "dark" ? "dark" : "light");
      setSuccess(true);
      playWave("up");
      const dest = safeReturnTo(searchParams.get("returnTo"));
      setTimeout(() => router.push(dest), 500);
    } catch (err) {
      setError(friendlyErrorMessage(err));
      triggerShake();
      playWave("down");
      if (err instanceof ApiError && err.data?.needsVerification) {
        setNeedsVerification(true);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResendStatus("");
    setResending(true);
    try {
      const data = await apiFetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setResendStatus(data.message);
    } catch (err) {
      setResendStatus(friendlyErrorMessage(err));
    } finally {
      setResending(false);
    }
  }

  return (
    <AuthShell focused={focused} wave={wave} waveKey={waveKey}>
      <div className="va-head">
        <span className="va-eyebrow">Sign in</span>
        <h1>
          Welcome back to <span className="serif">Veloce</span>
        </h1>
        <p>Access your notes, purchases, and scribe earnings from any device.</p>
      </div>

      <div className={shakeOn ? "va-shake" : undefined}>
      <form className="va-form" onSubmit={handleSubmit} noValidate>
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
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={checkCaps}
            onKeyUp={checkCaps}
            onFocus={() => setFocused(true)}
            onBlur={() => { setFocused(false); setCapsOn(false); }}
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

        <div className="va-row">
          <label className="va-remember">
            <input type="checkbox" checked={keepSignedIn} onChange={(e) => setKeepSignedIn(e.target.checked)} />
            <span className="va-check">
              <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.2l2.6 2.6L10 3.4" /></svg>
            </span>
            Keep me signed in
          </label>
          <a href="/forgot-password" className="va-forgot">Forgot password?</a>
        </div>

        {error && <div className="va-error" role="alert">{error}</div>}
        {needsVerification && (
          <div>
            <button type="button" className="va-secondary-btn" onClick={handleResend} disabled={resending || !email}>
              {resending ? "Sending..." : "Resend verification email"}
            </button>
            {resendStatus && <p className="va-note">{resendStatus}</p>}
          </div>
        )}

        <button
          type="submit"
          className={`va-btn${loading ? " is-loading" : ""}${success ? " is-success" : ""}`}
          disabled={loading || success}
        >
          <span className="va-label">Sign in</span>
          <svg className="va-arrow" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M4 10h11M11 5.5l4.5 4.5-4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="va-spinner" aria-hidden="true" />
          <svg className="va-check-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7" />
          </svg>
        </button>
      </form>
      </div>

      <p className="va-cta">
        New to Veloce? <a href="/signup">Create an account</a>
      </p>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
