"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getStoredUser } from "@/lib/client-session";
import { useViewMode } from "@/lib/view-mode";
import { dismissMfaReminder, isMfaReminderDismissed } from "@/lib/mfa-reminder";
import { apiFetch } from "@/lib/api-client";
import "./mfa-reminder.css";

// Shown at the very top of the screen while an admin is in admin mode and
// hasn't turned on two-step verification. Never blocks anything: the X hides
// it until the next login, and it reappears whenever they sign in again.
export default function MfaReminder() {
  const pathname = usePathname() ?? "";
  const [role, setRole] = useState<"STUDENT" | "SCRIBE" | "ADMIN" | undefined>(undefined);
  const [mode] = useViewMode(role);
  const [mfaOn, setMfaOn] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(true); // hidden until we've checked

  const inAdminMode = role === "ADMIN" && mode === "ADMIN";

  useEffect(() => {
    setRole(getStoredUser()?.role);
    setDismissed(isMfaReminderDismissed());
  }, [pathname]);

  // Re-checked on navigation so the bar disappears right after they turn it
  // on in Settings. A failed check just leaves the bar hidden.
  useEffect(() => {
    if (!inAdminMode || dismissed) return;
    let cancelled = false;
    apiFetch("/api/account/mfa")
      .then((data) => {
        if (!cancelled) setMfaOn(!!(data.enabled ?? data.mfaEnabled));
      })
      .catch(() => {
        if (!cancelled) setMfaOn(null);
      });
    return () => {
      cancelled = true;
    };
  }, [inAdminMode, dismissed, pathname]);

  if (!inAdminMode || dismissed || mfaOn !== false) return null;

  return (
    <div className="mfa-reminder" role="alert">
      <span>
        Your admin account is protected by a password only. <Link href="/settings?tab=account">Turn on two-step verification</Link>
      </span>
      <button
        type="button"
        aria-label="Hide this reminder"
        onClick={() => {
          dismissMfaReminder();
          setDismissed(true);
        }}
      >
        ×
      </button>
    </div>
  );
}
