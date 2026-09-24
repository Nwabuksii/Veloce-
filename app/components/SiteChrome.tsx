"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SiteHeader from "@/app/components/SiteHeader";
import { CAMPUS } from "@/lib/campus";
import { getStoredUser, StoredUser } from "@/lib/client-session";
import AcademicProfileModal from "@/app/components/AcademicProfileModal";
import BlockingMessageModal from "@/app/components/BlockingMessageModal";

// Screens that own the whole viewport (split-screen auth, payment
// hand-off) render without the header/footer.
const BARE_ROUTES = ["/login", "/signup", "/forgot-password", "/reset-password", "/verify-email", "/payment/callback"];

// The two global blocking gates — checked once per navigation, in order:
// an incomplete academic profile comes first (there's no point asking
// someone to vote on a poll before we even know who they are), then any
// unread SERIOUS message or un-voted poll. Neither is dismissible; each
// fully clears before the app underneath becomes reachable.
export default function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const isBare = pathname === "/" || BARE_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));

  const [user, setUser] = useState<StoredUser | null>(null);
  // undefined = still checking, true/false = known — avoids a flash of
  // the blocking modal before the account fetch resolves.
  const [profileComplete, setProfileComplete] = useState<boolean | undefined>(undefined);
  const [messagesClear, setMessagesClear] = useState(false);

  useEffect(() => {
    if (isBare) return;
    // Re-check on every navigation — a new SERIOUS message or poll can
    // arrive while browsing, and this is deliberately cheap (indexed
    // lookup, no polling loop) rather than something to gate behind a timer.
    setMessagesClear(false);
    const stored = getStoredUser();
    setUser(stored);
    if (!stored) {
      setProfileComplete(true); // not logged in — nothing to gate, /login etc. handle that
      return;
    }

    // ADMIN accounts aren't students-in-a-department — only gate
    // STUDENT/SCRIBE, who this profile actually describes.
    if (stored.role === "ADMIN") {
      setProfileComplete(true);
      return;
    }

    fetch("/api/account")
      .then((res) => res.json())
      .then((data) => {
        const complete = Boolean(data.user?.departmentId && data.user?.level);
        setProfileComplete(complete);
        if (complete) {
          setUser((prev) => (prev ? { ...prev, departmentId: data.user.departmentId, level: data.user.level } : prev));
        }
      })
      .catch((err) => {
        // Fail SAFE, not open — this gate exists specifically to be
        // unescapable, so a network hiccup or an unexpected error must
        // never silently wave someone through with an incomplete profile.
        // Logged so a real bug here is visible instead of invisible.
        console.error("Academic-profile check failed — showing the gate rather than skipping it:", err);
        setProfileComplete(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, isBare]);

  if (isBare) return <>{children}</>;

  const showAcademicGate = user && profileComplete === false;

  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="site-main">{children}</main>
      <footer className="site-footer">
        <div className="site-footer-inner">
          <div className="campus">{CAMPUS.name} Campus Network</div>
          <div className="site-footer-links">
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/feedback">Feedback</Link>
            <span>© {new Date().getFullYear()} Veloce</span>
          </div>
        </div>
      </footer>

      {showAcademicGate && user && (
        <AcademicProfileModal user={user} onComplete={() => setProfileComplete(true)} />
      )}
      {!showAcademicGate && profileComplete && user && !messagesClear && (
        <BlockingMessageModal onClear={() => setMessagesClear(true)} />
      )}
    </div>
  );
}
