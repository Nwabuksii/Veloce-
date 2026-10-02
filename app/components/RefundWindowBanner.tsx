"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import { apiFetch } from "@/lib/api-client";
import { minutesLeftLabel } from "@/lib/refund-notice";
import "./refund-banner.css";

interface WindowResponse {
  windowMinutes: number;
  serverNow: number;
  purchases: { purchaseId: string; noteId: string; blockTitle: string; expiresAt: number }[];
}

// Pages that already show the refund options themselves.
const HIDE_ON = ["/purchases", "/payment/complete"];
const DISMISS_KEY = "veloce.refundBanner.dismissed";

function readDismissed(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(DISMISS_KEY) || "[]");
  } catch {
    return [];
  }
}

// A slim bar under the header while any purchase is still inside its refund
// window: "Refund window open — 18 min left. Request refund". Never blocks.
export default function RefundWindowBanner() {
  const pathname = usePathname() ?? "";
  const [data, setData] = useState<WindowResponse | null>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [dismissed, setDismissed] = useState<string[]>([]);

  const hidden = HIDE_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  useEffect(() => {
    setDismissed(readDismissed());
    const user = getStoredUser();
    if (!user || user.role === "ADMIN" || hidden) return;
    let cancelled = false;
    apiFetch<WindowResponse>("/api/purchases/refund-window")
      .then((d) => {
        if (cancelled) return;
        setOffset(d.serverNow - Date.now());
        setData(d);
      })
      .catch(() => !cancelled && setData(null)); // a reminder, never worth an error
    return () => {
      cancelled = true;
    };
  }, [pathname, hidden]);

  const live = data?.purchases.filter((p) => p.expiresAt > now + offset) ?? [];
  const active = live.length > 0 && !hidden;

  // Tick only while there is something to count down.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  const visible = live.filter((p) => !dismissed.includes(p.purchaseId));
  if (!active || visible.length === 0) return null;

  const first = visible[0]; // closes soonest
  const more = visible.length - 1;

  function dismiss() {
    const next = [...dismissed, ...visible.map((p) => p.purchaseId)];
    try {
      sessionStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    } catch {}
    setDismissed(next);
  }

  return (
    <div className="refund-banner" role="status">
      <span className="refund-banner-text">
        Refund window open for “{first.blockTitle}”: <strong>{minutesLeftLabel(first.expiresAt - (now + offset))} left</strong>
        {more > 0 ? ` (+${more} more)` : ""}.
      </span>
      <Link href={`/purchases?refund=${first.purchaseId}`} className="refund-banner-link">
        Request refund
      </Link>
      <button type="button" className="refund-banner-x" aria-label="Hide this reminder" onClick={dismiss}>
        ×
      </button>
    </div>
  );
}
