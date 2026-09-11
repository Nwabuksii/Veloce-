"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, clearSession, StoredUser } from "@/lib/client-session";

export default function ProfileMenu() {
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const u = getStoredUser();
    setUser(u);
    if (u) {
      fetch("/api/messages/unread-count")
        .then((res) => res.json())
        .then((data) => setUnreadCount(data.count || 0))
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleLogout() {
    await clearSession();
    router.push("/login");
  }

  function go(path: string) {
    setOpen(false);
    router.push(path);
  }

  if (!user) return null;

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      <button
        className="role-pill"
        style={{ cursor: "pointer", position: "relative" }}
        onClick={() => setOpen((o) => !o)}
      >
        <i className="fas fa-user-graduate"></i> {user.fullName} · {user.role}
        <i className="fas fa-chevron-down" style={{ fontSize: "0.65rem", marginLeft: "0.2rem" }}></i>
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              background: "var(--text-danger)",
              color: "white",
              borderRadius: "50%",
              width: 18,
              height: 18,
              fontSize: "0.65rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="profile-menu-dropdown"
          style={{
            position: "absolute",
            top: "calc(100% + 0.5rem)",
            background: "var(--surface)",
            border: "1px solid var(--border-blue)",
            borderRadius: "1rem",
            boxShadow: "0 12px 24px -8px rgba(0,20,40,0.18)",
            minWidth: "230px",
            padding: "0.5rem",
            zIndex: 50,
          }}
        >
          <MenuItem icon="fa-th-large" label="Dashboard" onClick={() => go("/dashboard")} />
          <MenuItem
            icon="fa-envelope"
            label={unreadCount > 0 ? `Messages (${unreadCount})` : "Messages"}
            onClick={() => go("/messages")}
          />
          <MenuItem icon="fa-book-reader" label="My purchases" onClick={() => go("/purchases")} />
          <MenuItem icon="fa-user-check" label="Following" onClick={() => go("/following")} />
          <MenuItem icon="fa-hand-point-up" label="Request a block" onClick={() => go("/requests")} />
          <MenuItem icon="fa-list-check" label="My requests" onClick={() => go("/requests/mine")} />

          {user.role === "STUDENT" && (
            <MenuItem icon="fa-undo" label="Appeal reinstatement" onClick={() => go("/scribe/appeal")} />
          )}

          {(user.role === "SCRIBE" || user.role === "ADMIN") && (
            <>
              <Divider />
              <MenuItem icon="fa-store" label="Scribe workspace" onClick={() => go("/scribe/workspace")} />
              <MenuItem icon="fa-wallet" label="Earnings" onClick={() => go("/scribe/earnings")} />
              <MenuItem icon="fa-cloud-upload-alt" label="Upload notes" onClick={() => go("/scribe/upload")} />
              <MenuItem icon="fa-fire" label="Discovery feed" onClick={() => go("/scribe/requests")} />
            </>
          )}

          {user.role === "ADMIN" && (
            <>
              <Divider />
              <MenuItem icon="fa-user-cog" label="Admin panel" onClick={() => go("/admin")} />
              <MenuItem icon="fa-undo" label="Review appeals" onClick={() => go("/admin/appeals")} />
              <MenuItem icon="fa-flag" label="Moderation queue" onClick={() => go("/admin/moderation")} />
              <MenuItem icon="fa-exclamation-triangle" label="Reports" onClick={() => go("/admin/reports")} />
              <MenuItem icon="fa-money-bill-wave" label="Payouts" onClick={() => go("/admin/payouts")} />
              <MenuItem icon="fa-ban" label="Manage users (ban)" onClick={() => go("/admin/users")} />
              <MenuItem icon="fa-user-minus" label="Manage scribes" onClick={() => go("/admin/scribes")} />
              <MenuItem icon="fa-chart-line" label="Financial ledger" onClick={() => go("/admin/finance")} />
              <MenuItem icon="fa-envelope-open-text" label="Message a user" onClick={() => go("/admin/messages")} />
            </>
          )}

          <Divider />
          <MenuItem icon="fa-gear" label="Settings" onClick={() => go("/settings")} />
          <MenuItem icon="fa-sign-out-alt" label="Logout" onClick={handleLogout} danger />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.6rem",
        width: "100%",
        textAlign: "left",
        background: "none",
        border: "none",
        padding: "0.55rem 0.7rem",
        borderRadius: "0.6rem",
        fontSize: "0.85rem",
        color: danger ? "var(--text-danger)" : "var(--text-primary)",
        cursor: "pointer",
      }}
    >
      <i className={`fas ${icon}`} style={{ width: "16px" }}></i> {label}
    </button>
  );
}

function Divider() {
  return <div style={{ height: "1px", background: "var(--bg-info)", margin: "0.4rem 0" }} />;
}
