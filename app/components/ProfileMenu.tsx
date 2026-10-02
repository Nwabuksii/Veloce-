"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { clearSession, getStoredUser, StoredUser } from "@/lib/client-session";
import Avatar from "@/app/components/Avatar";
import { Icon } from "@/app/components/icons";
import { toggleTheme } from "@/app/components/toggle-theme";
import { allowedModes, HOME_FOR, useViewMode, Role } from "@/lib/view-mode";
import "./role-toggle.css";

interface Shortcut {
  label: string;
  href: string;
  icon?: keyof typeof Icon;
}

// What sits under the role switch, by the role being viewed. Scribe and
// admin views mirror the top nav; the student view keeps the extras only a
// real student needs (applying, appealing).
function shortcutsFor(mode: Role, realRole: Role): { label: string; items: Shortcut[] } {
  if (mode === "ADMIN") {
    return {
      label: "Admin tools",
      items: [
        // Moderation, Reports, Finance and Users are already in the top nav;
        // everything else (scribes, security, feedback, analytics…) is one tap
        // away on the Admin Dashboard.
        { label: "Admin Dashboard", href: "/admin" },
        { label: "Applications", href: "/admin/applications" },
        { label: "Appeals", href: "/admin/appeals" },
        { label: "Payouts", href: "/admin/payouts" },
        { label: "Message Users", href: "/admin/messages" },
      ],
    };
  }
  if (mode === "SCRIBE") {
    return {
      label: "Scribe tools",
      items: [
        { label: "Scribe Studio", href: "/scribe" },
        { label: "Analytics", href: "/scribe/analytics" },
        { label: "Earnings", href: "/scribe/earnings" },
        { label: "Upload Notes", href: "/scribe/upload" },
        { label: "Discovery Feed", href: "/scribe/requests" },
      ],
    };
  }
  const items: Shortcut[] = [
    { label: "Request a Block", href: "/requests" },
    { label: "My Requests", href: "/requests/mine" },
    { label: "My Library", href: "/purchases" },
    { label: "Following", href: "/following" },
  ];
  if (realRole === "STUDENT") {
    items.push({ label: "Become a Scribe", href: "/scribe/apply" }, { label: "Appeal reinstatement", href: "/scribe/appeal" });
  }
  return { label: "Shortcuts", items };
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
  const [viewMode, setViewMode] = useViewMode(currentUser?.role);
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
  const mode = viewMode ?? currentUser.role;
  const shortcuts = shortcutsFor(mode, currentUser.role);
  const modes = allowedModes(currentUser.role);
  const MODE_LABEL: Record<Role, string> = { STUDENT: "Student", SCRIBE: "Scribe", ADMIN: "Admin" };
  const ROLE_LABEL = MODE_LABEL; // the account's real role, whichever view they're in

  function switchTo(next: Role) {
    setViewMode(next);
    go(HOME_FOR[next]);
  }

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
                <div className="dd-user-name">
                  <span className="dd-user-name-text">{currentUser.fullName}</span>
                  <span className="dd-user-role">· {ROLE_LABEL[currentUser.role]}</span>
                </div>
                <div className="dd-user-email">{currentUser.email}</div>
              </div>
            </div>
          </div>

          {modes.length > 1 && (
            <div className="dd-role" role="group" aria-label="Switch role">
              {modes.map((m) => (
                <button key={m} type="button" className={`dd-role-btn${mode === m ? " is-active" : ""}`} aria-pressed={mode === m} onClick={() => switchTo(m)}>
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
          )}

          <div className="dd-section">
            <div className="dd-label">Account</div>
            <button type="button" className="dd-item" role="menuitem" onClick={() => go("/messages")}>
              {Icon.message()}
              Messages
              {unread > 0 && <span className="dd-badge new">{unread > 9 ? "9+" : unread}</span>}
            </button>
            <button type="button" className="dd-item" role="menuitem" onClick={() => go("/badges")}>
              {Icon.trophy()}
              Badges
            </button>
            {currentUser.role === "SCRIBE" && (
              <button type="button" className="dd-item" role="menuitem" onClick={() => go("/scribe/badges")}>
                {Icon.trophy()}
                My badges
              </button>
            )}
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
