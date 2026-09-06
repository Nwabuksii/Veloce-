"use client";

import { useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { saveUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";

// Only ever redirect to a relative, same-app path (starts with a single
// "/", never "//" which browsers treat as protocol-relative to another
// host) — otherwise a crafted ?returnTo= could send someone off-site right
// after they log in.
function safeReturnTo(raw: string | null): string {
  if (!raw) return "/dashboard";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/dashboard";
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      saveUser(data.user);
      router.push(safeReturnTo(searchParams.get("returnTo")));
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
          Course notes, written by the students who actually took them.
        </p>
      </div>

      <div className="split-auth-right">
        <div className="auth-card">
          <h1>Welcome back</h1>
          <p className="auth-sub">Log in to your account</p>

          <form onSubmit={handleSubmit}>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>

            {error && <div className="auth-error">{error}</div>}

            <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
              {loading ? "Logging in..." : "Log in"}
            </button>
          </form>

          <p className="auth-switch">
            No account? <a href="/signup">Sign up</a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
