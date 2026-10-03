"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import { apiFetch } from "@/lib/api-client";
import { REFUND_NOTICE_DEADLINE, REFUND_NOTICE_SHORT, REFUND_NOTICE_STEPS, minutesLeftLabel } from "@/lib/refund-notice";
import { Icon } from "@/app/components/icons";
import "./complete.css";

interface WindowResponse {
  windowMinutes: number;
  serverNow: number;
  purchases: { purchaseId: string; noteId: string; blockTitle: string; expiresAt: number }[];
}

// Where a buyer lands after paying (card or credit). Instead of dropping them
// on the dashboard, it says they can get a refund, how long they have, and
// where to do it.
function CompleteContent() {
  const router = useRouter();
  const purchaseId = useSearchParams().get("purchase");
  const [data, setData] = useState<WindowResponse | null>(null);
  const [offset, setOffset] = useState(0); // server clock minus this device's clock
  const [now, setNow] = useState(() => Date.now());
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!getStoredUser()) {
      router.push("/login");
      return;
    }
    apiFetch<WindowResponse>("/api/purchases/refund-window")
      .then((d) => {
        setOffset(d.serverNow - Date.now());
        setData(d);
      })
      .catch(() => {})
      .finally(() => setDone(true));
  }, [router]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const mine = data?.purchases.find((p) => p.purchaseId === purchaseId);
  const msLeft = mine ? mine.expiresAt - (now + offset) : 0;
  const open = !!mine && msLeft > 0;
  const minutes = data?.windowMinutes ?? 30;

  return (
    <div className="page-wrap">
      <div className="panel pc-card">
        <div className="pc-check">{Icon.check()}</div>
        <h1 className="pc-title">Purchase complete</h1>
        {mine && <p className="pc-sub">You unlocked “{mine.blockTitle}”.</p>}

        {open ? (
          <>
            <div className="pc-timer" aria-live="polite">
              <span className="pc-timer-label">Refund window closes in</span>
              <strong>{minutesLeftLabel(msLeft)}</strong>
            </div>
            <p className="pc-text">{REFUND_NOTICE_SHORT}</p>
            <ol className="pc-steps">
              {REFUND_NOTICE_STEPS.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <p className="pc-text pc-muted">{REFUND_NOTICE_DEADLINE}</p>
            <div className="pc-actions">
              <Link href={`/notes/${mine!.noteId}/read`} className="btn btn-primary">
                {Icon.book()} Read now
              </Link>
              <Link href={`/purchases?refund=${mine!.purchaseId}`} className="btn btn-ghost">
                Request a refund
              </Link>
            </div>
          </>
        ) : (
          <>
            {done && (
              <p className="pc-text">
                Your note is in your Purchases. Refunds can be requested within {minutes} minutes of buying; this purchase's window has closed or a request is already in.
              </p>
            )}
            <div className="pc-actions">
              <Link href="/purchases" className="btn btn-primary">
                Go to Purchases
              </Link>
              <Link href="/dashboard" className="btn btn-ghost">
                Back to dashboard
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function PaymentCompletePage() {
  return (
    <Suspense fallback={null}>
      <CompleteContent />
    </Suspense>
  );
}
