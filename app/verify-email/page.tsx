"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { saveUser } from "@/lib/client-session";
import Logo from "@/app/components/Logo";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";

function VerifyEmailInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState("Verifying your email...");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("Missing verification link — check the link in your email is complete.");
      setFailed(true);
      return;
    }

    apiFetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((data) => {
        saveUser(data.user);
        setStatus("Email verified! Taking you to your dashboard...");
        setTimeout(() => router.push("/dashboard"), 1200);
      })
      .catch((err) => {
        setStatus(friendlyErrorMessage(err));
        setFailed(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
          <h1>Verify your email</h1>
          <p className="auth-sub">{status}</p>
          {failed && (
            <p className="auth-switch">
              <a href="/login">Go to login</a> to request a new link.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailInner />
    </Suspense>
  );
}
