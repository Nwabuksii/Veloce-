"use client";

import { useRef, useState } from "react";
import { getStoredUser, saveUser } from "@/lib/client-session";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import Avatar from "@/app/components/Avatar";

export default function AvatarPicker() {
  const [user, setUser] = useState(() => getStoredUser());
  const [uploading, setUploading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  function updateLocal(patch: Partial<NonNullable<typeof user>>) {
    const current = getStoredUser();
    if (!current) return;
    const next = { ...current, ...patch };
    saveUser(next);
    setUser(next);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      // Raw fetch, not apiFetch — apiFetch always forces a JSON
      // Content-Type header, which stops the browser setting its own
      // multipart boundary. Same reason app/scribe/upload/page.tsx does
      // its own fetch() for file uploads instead of going through it.
      const res = await fetch("/api/account/avatar", { method: "POST", body: formData });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Upload failed");
      }
      updateLocal({ avatarUrl: data.user.avatarUrl, avatarDisplay: data.user.avatarDisplay });
      toast.success("Profile icon updated.");
    } catch (err) {
      toast.error(friendlyErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function setDisplay(avatarDisplay: "default" | "custom") {
    if (avatarDisplay === user!.avatarDisplay) return;
    setSwitching(true);
    try {
      await apiFetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarDisplay }),
      });
      updateLocal({ avatarDisplay });
    } catch (err) {
      toast.error(friendlyErrorMessage(err));
    } finally {
      setSwitching(false);
    }
  }

  async function handleRemove() {
    setUploading(true);
    try {
      await apiFetch("/api/account/avatar", { method: "DELETE" });
      updateLocal({ avatarUrl: null, avatarDisplay: "default" });
      toast.success("Profile icon removed.");
    } catch (err) {
      toast.error(friendlyErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  const hasCustom = !!user.avatarUrl;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        padding: "0.9rem 1.1rem",
        border: "1px solid var(--border-light)",
        borderRadius: "0.8rem",
        background: "var(--surface)",
        flexWrap: "wrap",
      }}
    >
      <Avatar name={user.fullName} imageUrl={user.avatarDisplay === "custom" ? user.avatarUrl : null} />

      <div style={{ flex: "1 1 200px" }}>
        <div style={{ fontWeight: 500, fontSize: "0.9rem", color: "var(--text-primary)" }}>Profile icon</div>
        <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
          Upload a photo anytime, and choose whether it or the generic icon shows around the app.
        </div>

        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem", flexWrap: "wrap" }}>
          <button className="btn press-on-tap" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            <i className="fas fa-upload"></i> {hasCustom ? "Replace photo" : "Upload photo"}
          </button>
          {hasCustom && (
            <button className="btn press-on-tap" disabled={uploading} onClick={handleRemove}>
              <i className="fas fa-trash"></i> Remove
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} style={{ display: "none" }} />
        </div>

        {hasCustom && (
          <div style={{ display: "flex", gap: "1rem", marginTop: "0.7rem", fontSize: "0.82rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", color: "var(--text-primary)" }}>
              <input
                type="radio"
                name="avatarDisplay"
                checked={user.avatarDisplay === "custom"}
                disabled={switching}
                onChange={() => setDisplay("custom")}
              />
              Show my photo
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer", color: "var(--text-primary)" }}>
              <input
                type="radio"
                name="avatarDisplay"
                checked={user.avatarDisplay !== "custom"}
                disabled={switching}
                onChange={() => setDisplay("default")}
              />
              Show generic icon
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
