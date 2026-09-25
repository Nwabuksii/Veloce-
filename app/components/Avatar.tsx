"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const PALETTE = ["#b45309", "#0f766e", "#7c3aed", "#be123c", "#1d4ed8", "#15803d", "#a21caf"];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

// Full-screen tap-to-view, the same idea as opening a contact photo in
// WhatsApp: dark backdrop, the photo at its natural size (capped to the
// viewport), tap anywhere or Escape to close.
function AvatarLightbox({ imageUrl, name, onClose }: { imageUrl: string; name: string; onClose: () => void }) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="avatar-lightbox" onClick={onClose} role="dialog" aria-modal="true" aria-label={`${name}'s photo`}>
      <button type="button" className="avatar-lightbox-close" onClick={onClose} aria-label="Close">
        <i className="fas fa-xmark"></i>
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="" className="avatar-lightbox-image" onClick={(e) => e.stopPropagation()} />
    </div>,
    document.body,
  );
}

export default function Avatar({
  name,
  size = "md",
  imageUrl,
  tone,
  enlargeOnTap = true,
}: {
  name: string;
  size?: "sm" | "md";
  // "ink" = the plain dark circle used in the site header, instead of the
  // per-name color used everywhere else.
  tone?: "ink";
  // The person's uploaded profile icon — only passed when they've chosen
  // to display it (avatarDisplay === "custom"). Omit/leave undefined to
  // always fall back to the initials-on-color-background look.
  imageUrl?: string | null;
  // Tap/click to view the photo full-screen, WhatsApp-style. Only has any
  // effect when imageUrl is set — initials have nothing to enlarge. Set
  // to false where the avatar already sits inside its own clickable
  // control (e.g. the header account-menu button), so tapping it keeps
  // doing that instead of opening the viewer.
  enlargeOnTap?: boolean;
}) {
  const [showLightbox, setShowLightbox] = useState(false);
  const canEnlarge = enlargeOnTap && !!imageUrl;

  const avatarNode = imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt=""
      className={`avatar avatar-image${size === "sm" ? " avatar-sm" : ""}`}
      aria-hidden="true"
    />
  ) : (
    <span
      className={`avatar${size === "sm" ? " avatar-sm" : ""}`}
      style={tone === "ink" ? undefined : { background: colorFor(name || "?") }}
      aria-hidden="true"
    >
      {initials(name || "?")}
    </span>
  );

  if (!canEnlarge) return avatarNode;

  return (
    <>
      <button
        type="button"
        className="avatar-tap"
        onClick={(e) => {
          e.stopPropagation();
          setShowLightbox(true);
        }}
        aria-label={`View ${name}'s photo`}
      >
        {avatarNode}
      </button>
      {showLightbox && imageUrl && (
        <AvatarLightbox imageUrl={imageUrl} name={name} onClose={() => setShowLightbox(false)} />
      )}
    </>
  );
}
