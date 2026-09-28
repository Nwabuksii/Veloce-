import { ReactElement } from "react";

// The template's icon set, as React components. Same paths, same stroke
// widths — the header, dropdown and dashboard all draw from this one file
// so every icon matches the design exactly.
const S = { fill: "none", viewBox: "0 0 24 24" } as const;
const stroke = (w: number) => ({ stroke: "currentColor", strokeWidth: w });

export const Icon: Record<string, () => ReactElement> = {
  grid: () => (
    <svg {...S} aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" {...stroke(1.8)} />
      <rect x="14" y="3" width="7" height="7" rx="1.5" {...stroke(1.8)} />
      <rect x="3" y="14" width="7" height="7" rx="1.5" {...stroke(1.8)} />
      <rect x="14" y="14" width="7" height="7" rx="1.5" {...stroke(1.8)} />
    </svg>
  ),
  plus: () => (
    <svg {...S} aria-hidden="true">
      <path d="M12 5v14M5 12h14" {...stroke(2)} strokeLinecap="round" />
    </svg>
  ),
  list: () => (
    <svg {...S} aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h10" {...stroke(1.8)} strokeLinecap="round" />
    </svg>
  ),
  book: () => (
    <svg {...S} aria-hidden="true">
      <path d="M4 4h10a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3V4z" {...stroke(1.7)} strokeLinejoin="round" />
      <path d="M17 7h2a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2" {...stroke(1.7)} strokeLinejoin="round" />
    </svg>
  ),
  user: () => (
    <svg {...S} aria-hidden="true">
      <circle cx="12" cy="8" r="4" {...stroke(1.7)} />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" {...stroke(1.7)} strokeLinecap="round" />
    </svg>
  ),
  workshop: () => (
    <svg {...S} aria-hidden="true">
      <path d="M4 20V4h10l6 6v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" {...stroke(1.7)} strokeLinejoin="round" />
      <path d="M14 4v6h6" {...stroke(1.7)} strokeLinejoin="round" />
    </svg>
  ),
  chart: () => (
    <svg {...S} aria-hidden="true">
      <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" {...stroke(1.8)} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  coin: () => (
    <svg {...S} aria-hidden="true">
      <circle cx="12" cy="12" r="9" {...stroke(1.7)} />
      <path d="M12 7v10M9 9.5h4a2 2 0 0 1 0 4H9M9 13.5h5" {...stroke(1.5)} strokeLinecap="round" />
    </svg>
  ),
  upload: () => (
    <svg {...S} aria-hidden="true">
      <path d="M12 16V4M7 9l5-5 5 5" {...stroke(2)} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" {...stroke(1.8)} strokeLinecap="round" />
    </svg>
  ),
  compass: () => (
    <svg {...S} aria-hidden="true">
      <circle cx="12" cy="12" r="9" {...stroke(1.7)} />
      <path d="M15 9l-2 6-4 0 2-6z" {...stroke(1.5)} strokeLinejoin="round" />
    </svg>
  ),
  shield: () => (
    <svg {...S} aria-hidden="true">
      <path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z" {...stroke(1.7)} strokeLinejoin="round" />
    </svg>
  ),
  check: () => (
    <svg {...S} aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7" {...stroke(2)} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  flag: () => (
    <svg {...S} aria-hidden="true">
      <path d="M5 21V4M5 5h12l-2 4 2 4H5" {...stroke(1.8)} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  arrow: () => (
    <svg fill="none" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11M11 5.5l4.5 4.5-4.5 4.5" {...stroke(1.8)} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  star: () => (
    <svg className="star" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  ),
  search: () => (
    <svg {...S} aria-hidden="true">
      <circle cx="11" cy="11" r="7" {...stroke(1.8)} />
      <path d="M20 20l-3.5-3.5" {...stroke(1.8)} strokeLinecap="round" />
    </svg>
  ),
  mail: () => (
    <svg {...S} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" {...stroke(1.7)} />
      <path d="M3.5 6.5l8.5 6 8.5-6" {...stroke(1.7)} strokeLinecap="round" />
    </svg>
  ),
  send: () => (
    <svg {...S} aria-hidden="true">
      <path d="M21 3L10.5 13.5M21 3l-7 18-3.5-7.5L3 10z" {...stroke(1.7)} strokeLinejoin="round" />
    </svg>
  ),
  // speech bubble — the template's "Messages" icon
  message: () => (
    <svg {...S} aria-hidden="true">
      <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8l-4 3V6z" {...stroke(1.7)} strokeLinejoin="round" />
    </svg>
  ),
  gear: () => (
    <svg {...S} aria-hidden="true">
      <circle cx="12" cy="12" r="3" {...stroke(1.7)} />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        {...stroke(1.5)}
        strokeLinejoin="round"
      />
    </svg>
  ),
  moon: () => (
    <svg {...S} aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" {...stroke(1.7)} strokeLinejoin="round" />
    </svg>
  ),
  sun: () => (
    <svg {...S} aria-hidden="true">
      <circle cx="12" cy="12" r="4" {...stroke(1.7)} />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" {...stroke(1.7)} strokeLinecap="round" />
    </svg>
  ),
  logout: () => (
    <svg {...S} aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" {...stroke(1.7)} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  caret: () => (
    <svg className="pcaret" {...S} aria-hidden="true">
      <path d="M6 9l6 6 6-6" {...stroke(2)} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};
