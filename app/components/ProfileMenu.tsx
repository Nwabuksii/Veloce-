"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { clearSession, getStoredUser, StoredUser } from "@/lib/client-session";
import Avatar from "@/app/components/Avatar";

const ROLE_LABEL: Record<StoredUser["role"], string> = {
  STUDENT: "Student",
  SCRIBE: "Scribe",
  ADMIN: "Admin",
};

// The avatar in the top-right of the site header. Everything that used to
// live in this dropdown and is part of everyday navigation (catalog,
// requests, library, scribe tools, messages, admin) now sits directly in
// the header — what's left here is account-level only.
export default function ProfileMenu({ user: userProp }: { user?: StoredUser }) {
  const currentUser = userProp ?? getStoredUser();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  if (!currentUser) return null;

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

  // The person's own choice (Settings > Display) of whether this shows
  // their uploaded photo or the initials — uploading one doesn't force it on.
  const imageUrl = currentUser.avatarDisplay === "custom" ? currentUser.avatarUrl : null;

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      <button
        className="avatar-btn"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar name={currentUser.fullName} imageUrl={imageUrl} size="sm" tone="ink" />
      </button>

      {open && (
        <div className="menu" role="menu">
          <div className="menu-head">
            <strong>{currentUser.fullName}</strong>
            <span>
              {ROLE_LABEL[currentUser.role]} · {currentUser.email}
            </span>
          </div>
          <div className="menu-divider" />
          <button className="menu-item" role="menuitem" onClick={() => go("/settings")}>
            <i className="fas fa-gear"></i> Settings
          </button>
          <button className="menu-item" role="menuitem" onClick={() => go("/feedback")}>
            <i className="fas fa-comment-dots"></i> Feedback
          </button>
          {currentUser.role === "STUDENT" && (
            <button className="menu-item" role="menuitem" onClick={() => go("/scribe/appeal")}>
              <i className="fas fa-undo"></i> Appeal reinstatement
            </button>
          )}
          <div className="menu-divider" />
          <button className="menu-item is-danger" role="menuitem" onClick={handleLogout}>
            <i className="fas fa-sign-out-alt"></i> Logout
          </button>
        </div>
      )}
    </div>
  );
}
