"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";

function PaymentCallbackContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState("Verifying your payment...");

  useEffect(() => {
    const reference = params.get("reference") || params.get("trxref");

    if (!reference) {
      setStatus("Missing payment reference — if you were charged, contact support.");
      return;
    }

    apiFetch("/api/payments/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference }),
    })
      .then(() => {
        setStatus("Payment confirmed — unlocking your block...");
        setTimeout(() => router.push("/dashboard"), 1200);
      })
      .catch((err) => setStatus(friendlyErrorMessage(err)));
  }, [params, router]);

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: "center" }}>
        <h1>
          Veloce <span className="accent">.</span>
        </h1>
        <p className="auth-sub">{status}</p>
      </div>
    </div>
  );
}

export default function PaymentCallbackPage() {
  return (
    <Suspense fallback={
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: "center" }}>
          <h1>
            Veloce <span className="accent">.</span>
          </h1>
          <p className="auth-sub">Verifying your payment...</p>
        </div>
      </div>
    }>
      <PaymentCallbackContent />
    </Suspense>
  );
}
