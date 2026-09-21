"use client";

// Same emblem as the reference design: a diamond with an amber wave through
// it. `tile` wraps it in the rounded square used in the site header — the
// square's colors come from CSS (see .logo-tile in globals.css) so it flips
// with the light/dark theme; without `tile` it's the bare mark, used on the
// dark side panel of the auth screens.
export default function Logo({ size = 100, tile = false }: { size?: number; tile?: boolean }) {
  const strokeWidth = tile || size < 48 ? 2.5 : 1.75;

  const mark = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={tile ? size / 2 : size}
      height={tile ? size / 2 : size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      style={tile ? undefined : { color: "#60A5FA" }}
    >
      <path d="M12 3L20 12L12 21L4 12Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 12C8 14 16 10 20 12" stroke="#F59E0B" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  if (!tile) return mark;

  return (
    <span className="logo-tile" style={{ width: size, height: size }}>
      {mark}
    </span>
  );
}
