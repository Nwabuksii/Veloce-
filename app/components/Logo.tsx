"use client";

// The Veloce mark: two book spines leaning together into a "V", gold-trimmed,
// set on a dark badge. Matches the reference template exactly. `tile` wraps
// it in the rounded badge used in the site header; `animated` adds the
// gentle settle-in + gold-knot pulse used on the auth screens.
export default function Logo({
  size = 100,
  tile = false,
  animated = false,
}: {
  size?: number;
  tile?: boolean;
  animated?: boolean;
}) {
  const mark = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      role="img"
      aria-label="Veloce"
      className={animated ? "veloce-logo-mark is-animated" : "veloce-logo-mark"}
    >
      <defs>
        <linearGradient id="veloceBadgeBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b1813" />
          <stop offset="1" stopColor="#0d0b08" />
        </linearGradient>
        <linearGradient id="veloceSpineL" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#f5efe2" />
          <stop offset="1" stopColor="#c9bfa8" />
        </linearGradient>
        <linearGradient id="veloceSpineR" x1="1" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#f5efe2" />
          <stop offset="1" stopColor="#b8ae95" />
        </linearGradient>
      </defs>

      <rect width="48" height="48" rx="13" fill="url(#veloceBadgeBg)" />
      <rect x="0.5" y="0.5" width="47" height="47" rx="12.5" stroke="rgba(201,169,97,0.24)" strokeWidth="1" />

      {/* Left book, leaning right */}
      <path className="veloce-logo-spine veloce-logo-spine-l" d="M14.5 14 L20.5 14 L25.2 35.5 L23.2 35.5 Z" fill="url(#veloceSpineL)" />
      {/* Right book, leaning left */}
      <path className="veloce-logo-spine veloce-logo-spine-r" d="M33.5 14 L27.5 14 L22.8 35.5 L24.8 35.5 Z" fill="url(#veloceSpineR)" />

      {/* Gold top edges */}
      <line x1="11.5" y1="14" x2="19" y2="14" stroke="#c9a961" strokeWidth="1" strokeLinecap="round" />
      <line x1="36.5" y1="14" x2="29" y2="14" stroke="#c9a961" strokeWidth="1" strokeLinecap="round" />

      {/* Gold mid-spine bands */}
      <line x1="16.2" y1="21" x2="19.2" y2="21" stroke="#c9a961" strokeWidth="0.7" strokeLinecap="round" opacity="0.7" />
      <line x1="31.8" y1="21" x2="28.8" y2="21" stroke="#c9a961" strokeWidth="0.7" strokeLinecap="round" opacity="0.7" />

      {/* Vertex knot — where the two spines meet */}
      <circle className="veloce-logo-knot" cx="24" cy="36.2" r="1.2" fill="#c9a961" />
    </svg>
  );

  if (!tile) return mark;

  return (
    <span className="logo-tile" style={{ width: size, height: size }}>
      {mark}
    </span>
  );
}
