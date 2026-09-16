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
}: {
  name: string;
  size?: "sm" | "md";
  // The person's uploaded profile icon — only passed when they've chosen
  // to display it (avatarDisplay === "custom"). Omit/leave undefined to
  // always fall back to the initials-on-color-background look.
  imageUrl?: string | null;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        className={`avatar avatar-image${size === "sm" ? " avatar-sm" : ""}`}
        aria-hidden="true"
      />
    );
  }

  return (
    <span
      className={`avatar${size === "sm" ? " avatar-sm" : ""}`}
      style={{ background: colorFor(name || "?") }}
      aria-hidden="true"
    >
      {initials(name || "?")}
    </span>
  );
}
