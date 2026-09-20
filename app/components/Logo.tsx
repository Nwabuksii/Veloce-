"use client";

// Single source of truth for the mark's two colors — change either one
// here and it updates everywhere Logo renders, instead of hunting through
// the SVG path attributes below. Kept as their own constants rather than
// pulling from globals.css's --ink/--accent because a raw SVG attribute
// (as opposed to a style="..." property) doesn't reliably resolve CSS
// custom properties in every browser — these are intentionally kept in
// sync with --ink and --accent by hand instead. If you change the site's
// accent color in globals.css, update LOGO_ACCENT to match here too.
export const LOGO_COLORS = {
  diamond: "#17342F", // matches --ink in app/globals.css
  wave: "#DD6B33", // matches --accent in app/globals.css
};

export default function Logo({ size = 100 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width={size} height={size}>
      <path
        d="M 50 15 L 75 50 L 50 85 L 25 50 Z"
        fill="none"
        stroke={LOGO_COLORS.diamond}
        strokeWidth="5"
        strokeLinejoin="miter"
      />
      <path d="M 50 15 L 75 50 L 50 85 Z" fill={LOGO_COLORS.diamond} opacity="0.15" />
      <path
        d="M 15 52 C 30 40, 45 62, 50 50 C 55 38, 70 60, 85 48"
        fill="none"
        stroke={LOGO_COLORS.wave}
        strokeWidth="4.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
