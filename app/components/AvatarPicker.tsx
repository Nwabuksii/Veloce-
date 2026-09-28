"use client";

import { useRef, useState } from "react";
import { getStoredUser, saveUser } from "@/lib/client-session";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import Avatar from "@/app/components/Avatar";
import { AIcon } from "@/app/components/AdminIcons";
import "@/app/admin/admin.css";
import "./avatar-picker.css";

export default function AvatarPicker() {
  const [user, setUser] = useState(() => getStoredUser());
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [switching, setSwitching] = useState(false);
  // Inline result of the last upload/remove, so the outcome stays visible
  // after the toast disappears.
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const busy = uploading || removing || switching;
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

    setStatus(null);
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
      setStatus({ kind: "ok", text: "Photo uploaded." });
    } catch (err) {
      const text = friendlyErrorMessage(err);
      toast.error(text);
      setStatus({ kind: "error", text: `Upload failed — ${text}` });
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
    setStatus(null);
    setRemoving(true);
    try {
      await apiFetch("/api/account/avatar", { method: "DELETE" });
      updateLocal({ avatarUrl: null, avatarDisplay: "default" });
      toast.success("Profile icon removed.");
      setStatus({ kind: "ok", text: "Photo removed." });
    } catch (err) {
      const text = friendlyErrorMessage(err);
      toast.error(text);
      setStatus({ kind: "error", text: `Could not remove photo — ${text}` });
    } finally {
      setRemoving(false);
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
          <button
            type="button"
            className="btn btn-ghost btn-sm press-on-tap"
            disabled={busy}
            aria-busy={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <>
                <span className="avatar-upload-spinner" aria-hidden="true" /> Uploading...
              </>
            ) : (
              <>
                {AIcon.upload()} {hasCustom ? "Replace photo" : "Upload photo"}
              </>
            )}
          </button>
          {hasCustom && (
            <button type="button" className="btn btn-ghost btn-sm press-on-tap" disabled={busy} aria-busy={removing} onClick={handleRemove}>
              {removing ? (
                <>
                  <span className="avatar-upload-spinner" aria-hidden="true" /> Removing...
                </>
              ) : (
                <>
                  {AIcon.trash()} Remove
                </>
              )}
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange} hidden />
        </div>

        <div className="avatar-status" role="status" aria-live="polite">
          {uploading && <span className="avatar-status-text">Uploading your photo — please wait, this can take a few seconds.</span>}
          {removing && <span className="avatar-status-text">Removing your photo...</span>}
          {!busy && status && <span className={`avatar-status-text ${status.kind === "error" ? "is-error" : "is-ok"}`}>{status.text}</span>}
        </div>

        {hasCustom && (
          <div className="radio-row">
            <label>
              <input type="radio" name="avatarDisplay" checked={user.avatarDisplay === "custom"} disabled={busy} onChange={() => setDisplay("custom")} />
              Show my photo
            </label>
            <label>
              <input type="radio" name="avatarDisplay" checked={user.avatarDisplay !== "custom"} disabled={busy} onChange={() => setDisplay("default")} />
              Show generic icon
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
