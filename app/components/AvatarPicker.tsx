"use client";

import { useRef, useState } from "react";
import { getStoredUser, saveUser } from "@/lib/client-session";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import Avatar from "@/app/components/Avatar";
import { AIcon } from "@/app/components/AdminIcons";
import "@/app/admin/admin.css";

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
    <div className="display-row">
      <Avatar name={user.fullName} imageUrl={user.avatarDisplay === "custom" ? user.avatarUrl : null} />

      <div className="display-info">
        <div className="display-title">Profile icon</div>
        <div className="display-desc">Upload a photo anytime, and choose whether it or the generic icon shows around the app.</div>

        <div className="display-actions">
          <button className="btn btn-ghost btn-sm press-on-tap" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {AIcon.upload()} {hasCustom ? "Replace photo" : "Upload photo"}
          </button>
          {hasCustom && (
            <button className="btn btn-ghost btn-sm press-on-tap" disabled={uploading} onClick={handleRemove}>
              {AIcon.trash()} Remove
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} hidden />
        </div>

        {hasCustom && (
          <div className="radio-row">
            <label>
              <input type="radio" name="avatarDisplay" checked={user.avatarDisplay === "custom"} disabled={switching} onChange={() => setDisplay("custom")} />
              Show my photo
            </label>
            <label>
              <input type="radio" name="avatarDisplay" checked={user.avatarDisplay !== "custom"} disabled={switching} onChange={() => setDisplay("default")} />
              Show generic icon
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
