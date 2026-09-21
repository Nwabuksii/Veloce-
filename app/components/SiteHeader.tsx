"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Logo from "@/app/components/Logo";
import ProfileMenu from "@/app/components/ProfileMenu";
import { getStoredUser, saveUser, StoredUser } from "@/lib/client-session";
import { fetchAdminCounts } from "@/lib/admin-counts";
import { applyTheme, syncThemeToServer, Theme } from "@/lib/theme";
import { CAMPUS, currentSession } from "@/lib/campus";

interface NavItem {
  label: string;
  href: string;
  active: boolean;
  badge?: number;
}

const SCRIBE_TOOLS = /^\/scribe(\/(workspace|analytics|earnings|upload|requests|apply))?\/?$/;

function toggleTheme() {
  const next: Theme = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
  syncThemeToServer(next);

  // Keep the cached user object in sync too, so the next page load in this
  // browser (which reads getStoredUser() first) sees it immediately.
  const user = getStoredUser();
  if (user) saveUser({ ...user, theme: next });
}

// The site-wide top navigation. Everything that used to hide inside the
// profile dropdown (catalog, requests, library, scribe tools, messages,
// admin) is a direct link here now.
export default function SiteHeader() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  // undefined = not read yet (server render / first paint), null = logged out.
  const [user, setUser] = useState<StoredUser | null | undefined>(undefined);
  const [unread, setUnread] = useState(0);
  const [adminTotal, setAdminTotal] = useState(0);
  const [credit, setCredit] = useState<number | null>(null);
  const [q, setQ] = useState("");

  // Re-read on every route change: the header stays mounted across client
  // navigations, and badges/credit/avatar can change between pages.
  useEffect(() => {
    const u = getStoredUser();
    setUser(u);
    setQ(new URLSearchParams(window.location.search).get("q") ?? "");
    if (!u) return;

    let cancelled = false;
    fetch("/api/messages/unread-count")
      .then((res) => res.json())
      .then((data) => !cancelled && setUnread(data.count || 0))
      .catch(() => {});
    fetch("/api/account")
      .then((res) => res.json())
      .then((data) => !cancelled && setCredit(data.user?.creditBalance ?? 0))
      .catch(() => {});
    if (u.role === "ADMIN") {
      fetchAdminCounts().then((c) => !cancelled && setAdminTotal(c.total));
    }
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // On the catalog, typing filters live (debounced); anywhere else, Enter
  // takes you to the catalog with the search applied.
  useEffect(() => {
    if (pathname !== "/dashboard") return;
    const t = setTimeout(() => {
      const term = q.trim();
      const current = new URLSearchParams(window.location.search).get("q") ?? "";
      if (term !== current) router.replace(term ? `/dashboard?q=${encodeURIComponent(term)}` : "/dashboard");
    }, 300);
    return () => clearTimeout(t);
  }, [q, pathname, router]);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `/dashboard?q=${encodeURIComponent(term)}` : "/dashboard");
  }

  const nav: NavItem[] = user
    ? [
        { label: "Catalog", href: "/dashboard", active: pathname.startsWith("/dashboard") || pathname.startsWith("/blocks") },
        { label: "Requests", href: "/requests", active: pathname.startsWith("/requests") },
        {
          label: "My Library",
          href: "/purchases",
          active: pathname.startsWith("/purchases") || pathname.startsWith("/following") || pathname.startsWith("/notes"),
        },
        {
          label: "Scribe Studio",
          href: user.role === "STUDENT" ? "/scribe/apply" : "/scribe",
          active: SCRIBE_TOOLS.test(pathname),
        },
        ...(user.role === "ADMIN"
          ? [{ label: "Admin", href: "/admin", active: pathname.startsWith("/admin"), badge: adminTotal }]
          : []),
      ]
    : [];

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <div className="brand-group">
          <Link href={user ? "/dashboard" : "/login"} className="brand">
            <Logo size={32} tile />
            <span>Veloce</span>
          </Link>
          {user !== undefined && (
            <span className="campus-pill">
              {CAMPUS.code} • {currentSession()}
            </span>
          )}
        </div>

        {nav.length > 0 && (
          <nav className="site-nav" aria-label="Main">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className={item.active ? "is-active" : undefined}>
                {item.label}
                {item.badge ? <span className="nav-badge">{item.badge > 9 ? "9+" : item.badge}</span> : null}
              </Link>
            ))}
          </nav>
        )}

        {user !== undefined && (
          <div className="header-actions">
            {user ? (
              <>
                <form className="header-search" onSubmit={handleSearch} role="search">
                  <i className="fas fa-search"></i>
                  <input
                    type="text"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search notes, codes..."
                    aria-label="Search notes"
                  />
                </form>
                {credit !== null && (
                  <Link href="/purchases" className="wallet-pill" title="Refund credit — applied automatically toward your next purchase">
                    <i className="fas fa-wallet"></i>
                    <span>₦{credit.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </Link>
                )}
                <Link href="/messages" className="icon-btn" aria-label={unread > 0 ? `Messages (${unread} unread)` : "Messages"}>
                  <i className="fas fa-envelope"></i>
                  {unread > 0 && <span className="badge">{unread > 9 ? "9+" : unread}</span>}
                </Link>
                <button type="button" className="icon-btn" aria-label="Toggle theme" onClick={toggleTheme}>
                  <i className="fas fa-moon theme-icon-light"></i>
                  <i className="fas fa-sun theme-icon-dark"></i>
                </button>
                <ProfileMenu user={user} />
              </>
            ) : (
              <>
                <button type="button" className="icon-btn" aria-label="Toggle theme" onClick={toggleTheme}>
                  <i className="fas fa-moon theme-icon-light"></i>
                  <i className="fas fa-sun theme-icon-dark"></i>
                </button>
                <Link href="/login" className="btn btn-sm">
                  Log in
                </Link>
                <Link href="/signup" className="btn btn-primary btn-sm">
                  Sign up
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
