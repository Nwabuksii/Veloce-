import { useState } from "react";

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

export default function Avatar({
  name,
  size = "md",
  imageUrl,
  tone,
  allowPreview = false,
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
  allowPreview?: boolean;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);

  if (imageUrl) {
    const image = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={name}
        className={`avatar avatar-image${size === "sm" ? " avatar-sm" : ""}`}
      />
    );

    if (!allowPreview) {
      return image;
    }

    return (
      <>
        <button
          type="button"
          aria-label={`Open photo for ${name}`}
          onClick={() => setPreviewOpen(true)}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-block" }}
        >
          {image}
        </button>
        {previewOpen && (
          <div
            onClick={() => setPreviewOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,0.7)", display: "grid", placeItems: "center", zIndex: 60, padding: "1rem" }}
          >
            <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", maxWidth: "min(420px, 90vw)", width: "100%", background: "rgba(15,23,42,0.85)", borderRadius: "1rem", border: "1px solid rgba(148,163,184,0.4)", padding: "0.8rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <button
                type="button"
                aria-label="Close image preview"
                onClick={() => setPreviewOpen(false)}
                style={{ alignSelf: "flex-end", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "999px", color: "white", width: 34, height: 34, cursor: "pointer" }}
              >
                ×
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={`${name} profile`}
                style={{ width: "100%", maxHeight: "75vh", objectFit: "contain", borderRadius: "0.8rem" }}
              />
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <span
      className={`avatar${size === "sm" ? " avatar-sm" : ""}`}
      style={tone === "ink" ? undefined : { background: colorFor(name || "?") }}
      aria-hidden="true"
    >
      {initials(name || "?")}
    </span>
  );
}
