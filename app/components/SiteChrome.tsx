"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SiteHeader from "@/app/components/SiteHeader";
import { CAMPUS } from "@/lib/campus";

// Screens that own the whole viewport (split-screen auth, payment
// hand-off) render without the header/footer.
const BARE_ROUTES = ["/login", "/signup", "/forgot-password", "/reset-password", "/verify-email", "/payment/callback"];

export default function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";

  if (pathname === "/" || BARE_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
    return <>{children}</>;
  }

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
    </div>
  );
}
