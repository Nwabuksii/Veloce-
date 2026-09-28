"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { clearSession, getStoredUser, StoredUser } from "@/lib/client-session";
import Avatar from "@/app/components/Avatar";
import { Icon } from "@/app/components/icons";
import { toggleTheme } from "@/app/components/toggle-theme";

interface Shortcut {
  label: string;
  href: string;
  icon?: keyof typeof Icon;
}

// Everything that isn't a top-level nav item lives here, grouped like the
// template's dropdown: account, role shortcuts, then theme + sign out.
function shortcutsFor(role: StoredUser["role"]): { label: string; items: Shortcut[] } {
  if (role === "ADMIN") {
    return {
      label: "Admin tools",
      items: [
        { label: "Browse Catalog", href: "/dashboard" },
        { label: "Applications", href: "/admin/applications" },
        { label: "Appeals", href: "/admin/appeals" },
        { label: "Payouts", href: "/admin/payouts" },
        { label: "Advanced Analytics", href: "/admin/advanced-analytics" },
        { label: "Manage Scribes", href: "/admin/scribes" },
        { label: "Message Users", href: "/admin/messages" },
        { label: "Feedback Inbox", href: "/admin/feedback" },
      ],
    };
  }
  if (role === "SCRIBE") {
    return {
      label: "Shortcuts",
      items: [
        { label: "Request a Block", href: "/requests" },
        { label: "My Requests", href: "/requests/mine" },
        { label: "My Library", href: "/purchases" },
        { label: "Following", href: "/following" },
      ],
    };
  }
  return {
    label: "Shortcuts",
    items: [
      { label: "Become a Scribe", href: "/scribe/apply" },
      { label: "Appeal reinstatement", href: "/scribe/appeal" },
    ],
  };
}

// The profile button in the top-right of the site header, with the
// template's dropdown: user card, account links, role shortcuts, dark-mode
// switch and sign out.
export default function ProfileMenu({
  user: userProp,
  unread = 0,
  credit = null,
}: {
  user?: StoredUser;
  unread?: number;
  credit?: number | null;
}) {
  const currentUser = userProp ?? getStoredUser();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  // Track the theme so the dropdown's own icon/label stay in step.
  useEffect(() => {
    const read = () => setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  if (!currentUser) return null;

  async function handleLogout() {
    await clearSession();
    router.push("/login");
  }

  function go(path: string) {
    setOpen(false);
    router.push(path);
  }

  // The person's own choice (Settings > Display) of whether this shows
  // their uploaded photo or the initials — uploading one doesn't force it on.
  const imageUrl = currentUser.avatarDisplay === "custom" ? currentUser.avatarUrl : null;
  const firstName = currentUser.fullName.trim().split(/\s+/)[0] || currentUser.fullName;
  const shortcuts = shortcutsFor(currentUser.role);

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      <button
        type="button"
        className={`profile-btn${open ? " is-open" : ""}`}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar name={currentUser.fullName} imageUrl={imageUrl} tone="ink" enlargeOnTap={false} />
        <span className="pname">{firstName}</span>
        {Icon.caret()}
      </button>

      {open && (
        <div className="dropdown" role="menu">
          <div className="dd-header">
            <div className="dd-user">
              <Avatar name={currentUser.fullName} imageUrl={imageUrl} tone="ink" enlargeOnTap={false} />
              <div className="dd-user-info">
                <div className="dd-user-name">{currentUser.fullName}</div>
                <div className="dd-user-email">{currentUser.email}</div>
              </div>
            </div>
          </div>

          <div className="dd-section">
            <div className="dd-label">Account</div>
            <button type="button" className="dd-item" role="menuitem" onClick={() => go("/messages")}>
              {Icon.message()}
              Messages
              {unread > 0 && <span className="dd-badge new">{unread > 9 ? "9+" : unread}</span>}
            </button>
            <button type="button" className="dd-item" role="menuitem" onClick={() => go("/settings")}>
              {Icon.gear()}
              Settings
            </button>
            <button type="button" className="dd-item" role="menuitem" onClick={() => go("/feedback")}>
              {Icon.send()}
              Feedback
            </button>
            {credit !== null && credit > 0 && (
              <button type="button" className="dd-item" role="menuitem" onClick={() => go("/purchases")} title="Refund credit — applied automatically toward your next purchase">
                {Icon.coin()}
                Refund credit
                <span className="dd-badge">₦{credit.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </button>
            )}
          </div>

          <div className="dd-section">
            <div className="dd-label">{shortcuts.label}</div>
            {shortcuts.items.map((it) => (
              <button key={it.href} type="button" className="dd-item" role="menuitem" onClick={() => go(it.href)}>
                {Icon.list()}
                {it.label}
              </button>
            ))}
          </div>

          <div className="dd-section">
            <button type="button" className="dd-item" role="menuitem" onClick={toggleTheme}>
              {isDark ? Icon.sun() : Icon.moon()}
              Dark mode
              <span className="theme-indicator">
                <span className="toggle-switch" />
              </span>
            </button>
            <button type="button" className="dd-item danger" role="menuitem" onClick={handleLogout}>
              {Icon.logout()}
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
