"use client";

import { ReactElement, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/app/components/Logo";
import ProfileMenu from "@/app/components/ProfileMenu";
import { Icon } from "@/app/components/icons";
import { toggleTheme } from "@/app/components/toggle-theme";
import { getStoredUser, StoredUser } from "@/lib/client-session";
import { fetchAdminCounts } from "@/lib/admin-counts";
import { useViewMode } from "@/lib/view-mode";

interface NavItem {
  label: string;
  href: string;
  icon: ReactElement;
  active: boolean;
  badge?: number;
}

// The site-wide top navigation, laid out exactly like the template: brand,
// role-aware nav with icons, then messages + profile button on the right.
export default function SiteHeader() {
  const pathname = usePathname() ?? "";
  // undefined = not read yet (server render / first paint), null = logged out.
  const [user, setUser] = useState<StoredUser | null | undefined>(undefined);
  const [unread, setUnread] = useState(0);
  const [adminTotal, setAdminTotal] = useState(0);
  const [credit, setCredit] = useState<number | null>(null);
  // Which role's nav to show — an admin/scribe can view the app as a lower role.
  const [viewMode] = useViewMode(user?.role);
  const mode = viewMode ?? user?.role;

  // Re-read on every route change: the header stays mounted across client
  // navigations, and badges/credit/avatar can change between pages.
  useEffect(() => {
    const u = getStoredUser();
    setUser(u);
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

  const is = (prefix: string) => pathname === prefix || pathname.startsWith(prefix + "/");

  let nav: NavItem[] = [];
  if (user) {
    const browse: NavItem = {
      label: "Browse",
      href: "/dashboard",
      icon: Icon.grid(),
      active: is("/dashboard") || is("/blocks"),
    };
    if (mode === "ADMIN") {
      nav = [
        { label: "Admin", href: "/admin", icon: Icon.shield(), active: pathname === "/admin", badge: adminTotal },
        { label: "Moderation", href: "/admin/moderation", icon: Icon.check(), active: is("/admin/moderation") },
        { label: "Reports", href: "/admin/reports", icon: Icon.flag(), active: is("/admin/reports") },
        { label: "Finance", href: "/admin/finance", icon: Icon.chart(), active: is("/admin/finance") },
        { label: "Users", href: "/admin/users", icon: Icon.user(), active: is("/admin/users") },
      ];
    } else if (mode === "SCRIBE") {
      nav = [
        browse,
        { label: "Studio", href: "/scribe", icon: Icon.workshop(), active: pathname === "/scribe" || is("/scribe/workspace") },
        { label: "Analytics", href: "/scribe/analytics", icon: Icon.chart(), active: is("/scribe/analytics") },
        { label: "Earnings", href: "/scribe/earnings", icon: Icon.coin(), active: is("/scribe/earnings") },
        { label: "Upload", href: "/scribe/upload", icon: Icon.upload(), active: is("/scribe/upload") },
        { label: "Discovery", href: "/scribe/requests", icon: Icon.compass(), active: is("/scribe/requests") },
      ];
    } else {
      nav = [
        browse,
        { label: "Requests", href: "/requests", icon: Icon.plus(), active: pathname === "/requests" },
        { label: "My Requests", href: "/requests/mine", icon: Icon.list(), active: is("/requests/mine") },
        {
          label: "Library",
          href: "/purchases",
          icon: Icon.book(),
          active: is("/purchases") || is("/notes"),
        },
        { label: "Following", href: "/following", icon: Icon.user(), active: is("/following") },
      ];
    }
  }

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href={user ? (mode === "ADMIN" ? "/admin" : "/dashboard") : "/login"} className="brand">
          <Logo size={38} tile />
          <span>Veloce</span>
        </Link>

        {nav.length > 0 && (
          <nav className="site-nav" aria-label="Main">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className={item.active ? "is-active" : undefined}>
                {item.icon}
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
                {mode === "STUDENT" && credit != null && (
                  <div
                    className="header-credit"
                    aria-label={`Available credit: ₦${credit.toLocaleString()}`}
                    title="Available credit"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      minHeight: 40,
                      padding: "5px 13px 5px 7px",
                      borderRadius: 999,
                      border: "1px solid rgba(201, 169, 97, 0.35)",
                      background: "linear-gradient(180deg, #2a2419 0%, #18150f 100%)",
                      color: "#d7bd78",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 10px rgba(0,0,0,0.12)",
                      fontFamily: "var(--font-mono), ui-monospace, monospace",
                      fontSize: 13,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        display: "grid",
                        placeItems: "center",
                        width: 30,
                        height: 30,
                        borderRadius: "50%",
                        background: "#efe5cf",
                        color: "#332a1d",
                        fontFamily: "var(--font-serif), Georgia, serif",
                        fontSize: 16,
                        fontWeight: 700,
                      }}
                    >
                      ₦
                    </span>
                    ₦{credit.toLocaleString()}
                  </div>
                )}
                <Link href="/messages" className="icon-btn" aria-label={unread > 0 ? `Messages (${unread} unread)` : "Messages"} title="Messages">
                  {Icon.message()}
                  {unread > 0 && <span className="badge">{unread > 9 ? "9+" : unread}</span>}
                </Link>
                <ProfileMenu user={user} unread={unread} credit={credit} />
              </>
            ) : (
              <>
                <button type="button" className="icon-btn" aria-label="Toggle theme" onClick={toggleTheme}>
                  <span className="theme-icon-light">{Icon.moon()}</span>
                  <span className="theme-icon-dark">{Icon.sun()}</span>
                </button>
                <Link href="/login" className="btn btn-sm">
                  Sign in
                </Link>
                <Link href="/signup" className="btn btn-primary btn-sm">
                  Create account
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
