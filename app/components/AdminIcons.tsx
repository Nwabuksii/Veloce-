import { ReactElement } from "react";
import { Icon } from "@/app/components/icons";

// Icons the template's admin views use that the shared icon set doesn't
// carry yet — same paths and stroke widths as the template. Anything the
// shared set already has is re-exported so admin pages import from one place.
const S = { fill: "none", viewBox: "0 0 24 24" } as const;
const st = (w: number) => ({ stroke: "currentColor", strokeWidth: w });

export const AIcon: Record<string, () => ReactElement> = {
  ...Icon,
  back: () => (
    <svg fill="none" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M16 10H5M9 5.5L4.5 10 9 14.5" {...st(1.8)} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  eye: () => (
    <svg {...S} aria-hidden="true">
      <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" {...st(1.7)} />
      <circle cx="12" cy="12" r="2.6" {...st(1.7)} />
    </svg>
  ),
  warn: () => (
    <svg {...S} aria-hidden="true">
      <path d="M12 4l9 16H3L12 4z" {...st(1.7)} strokeLinejoin="round" />
      <path d="M12 10v4M12 17.2v.1" {...st(1.9)} strokeLinecap="round" />
    </svg>
  ),
  trend: () => (
    <svg {...S} aria-hidden="true">
      <path d="M3 17l6-6 4 4 8-8" {...st(1.9)} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 7h-5M21 7v5" {...st(1.9)} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  spark: () => (
    <svg {...S} aria-hidden="true">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" {...st(1.7)} strokeLinecap="round" />
    </svg>
  ),
  clock: () => (
    <svg {...S} aria-hidden="true">
      <circle cx="12" cy="12" r="9" {...st(1.7)} />
      <path d="M12 7v5l3 2" {...st(1.7)} strokeLinecap="round" />
    </svg>
  ),
  trash: () => (
    <svg {...S} aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" {...st(1.7)} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  reply: () => (
    <svg {...S} aria-hidden="true">
      <path d="M9 7L4 12l5 5" {...st(1.8)} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 12h10a6 6 0 0 1 6 6v1" {...st(1.8)} strokeLinecap="round" />
    </svg>
  ),
  chevronDown: () => (
    <svg {...S} aria-hidden="true">
      <path d="M6 9l6 6 6-6" {...st(1.9)} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  chevronUp: () => (
    <svg {...S} aria-hidden="true">
      <path d="M6 15l6-6 6 6" {...st(1.9)} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  x: () => (
    <svg {...S} aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" {...st(2)} strokeLinecap="round" />
    </svg>
  ),
};
