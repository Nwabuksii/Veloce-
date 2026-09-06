"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { saveUser } from "@/lib/client-session";
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await apiFetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, password, universitySlug: UNIVERSITY_SLUG }),
      });

      saveUser(data.user);
      router.push("/dashboard");
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
          Join Babcock's own marketplace for course blocks — buy, sell, and never scramble for notes again.
        </p>
      </div>

      <div className="split-auth-right">
        <div className="auth-card">
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
        </div>
      </div>
    </div>
  );
}
