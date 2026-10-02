import { useId, type ReactElement } from "react";
import { badgeLabel, badgeTitle, parseBadgeKey, placeLabel, type CategoryId, type ParsedBadge, type Place } from "@/lib/badges";

// The badge artwork, redrawn as SVG to match the approved badge sheet: a
// pointed shield with laurels and a crown, an icon on a dark panel, then a
// "1st Place" pill and a date pill. Only change from the sheet: Global Leader
// and the Highest Rated / Top Seller / Most Read / Most Followed badges have
// NO number or numeral under the icon (rank shows by colour and the pill).
// Department, Consecutive Department and Fastest Growing keep theirs.

interface Palette {
  rim1: string; // shield rim, light
  rim2: string; // shield rim, dark
  panel1: string; // inner panel top
  panel2: string; // inner panel bottom
  leaf: string;
  ink: string; // icon + numeral colour
}

const GOLD: Palette = { rim1: "#ffd96a", rim2: "#b07a12", panel1: "#2a2108", panel2: "#0d0a03", leaf: "#e7b53b", ink: "#f7cf5a" };
const SILVER: Palette = { rim1: "#eef3ff", rim2: "#7f90b8", panel1: "#1d3566", panel2: "#0a1530", leaf: "#c3cde6", ink: "#e4ebfb" };
const BRONZE: Palette = { rim1: "#ffa56b", rim2: "#9a3d17", panel1: "#3a130c", panel2: "#160604", leaf: "#d9783e", ink: "#f0a070" };
const PURPLE: Palette = { rim1: "#c9a3ff", rim2: "#5a2aa8", panel1: "#2e1259", panel2: "#120626", leaf: "#a97be8", ink: "#e3d0ff" };
const GREEN: Palette = { rim1: "#6fe0a8", rim2: "#12724a", panel1: "#0f3d2c", panel2: "#041a12", leaf: "#3fb882", ink: "#8bf0bd" };

const BY_PLACE: Record<Place, Palette> = { 1: GOLD, 2: SILVER, 3: BRONZE };
const NUMERAL = ["", "I", "II", "III"];

// Icons are drawn in a 24x24 box and placed in the middle of the shield.
const ICONS: Record<string, (c: string) => ReactElement> = {
  star: (c) => <polygon points="12 2.5 14.9 8.6 21.5 9.5 16.7 14.1 17.9 20.7 12 17.6 6.1 20.7 7.3 14.1 2.5 9.5 9.1 8.6" fill={c} />,
  cart: (c) => (
    <g fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 4h3l2.4 10.5h10.2l2.1-7.8H6.4" />
      <circle cx="9.5" cy="19.5" r="1.4" fill={c} />
      <circle cx="17.5" cy="19.5" r="1.4" fill={c} />
    </g>
  ),
  book: (c) => (
    <g fill="none" stroke={c} strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round">
      <path d="M12 6.5C9.8 4.9 6.6 4.4 3 4.9v13c3.6-.5 6.8 0 9 1.6 2.2-1.6 5.4-2.1 9-1.6v-13c-3.6-.5-6.8 0-9 1.6z" />
      <path d="M12 6.5v13" />
    </g>
  ),
  person: (c) => (
    <g fill={c}>
      <circle cx="12" cy="7.5" r="4" />
      <path d="M4.5 21c0-4.4 3.3-7.2 7.5-7.2s7.5 2.8 7.5 7.2z" />
    </g>
  ),
  trend: (c) => (
    <g fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 17.5 9 11.5 13 15.5 20.5 7.5" />
      <polyline points="14.5 7 20.5 7.5 20 13.5" />
    </g>
  ),
  globe: (c) => (
    <g fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="9.5" />
      <ellipse cx="12" cy="12" rx="4.2" ry="9.5" />
      <path d="M2.5 12h19M4 7h16M4 17h16M12 2.5v19" />
    </g>
  ),
  school: (c) => (
    <g fill={c}>
      <rect x="10.5" y="1.5" width="3" height="3" />
      <path d="M12 3.5 9 6.5h6z" />
      <path d="M12 6 2 11.5v1h20v-1z" />
      <rect x="3.5" y="12.5" width="17" height="8" />
      <rect x="10.5" y="15.5" width="3" height="5" fill="#0b0a05" />
      <rect x="5.5" y="14.5" width="2.2" height="2.6" fill="#0b0a05" />
      <rect x="16.3" y="14.5" width="2.2" height="2.6" fill="#0b0a05" />
    </g>
  ),
};

function Laurel({ fill }: { fill: string }) {
  // Seven leaves climbing the left side; the right side mirrors it.
  const leaves = Array.from({ length: 7 }, (_, i) => {
    const t = i / 6;
    const x = 17 + 5 * Math.sin(t * Math.PI) - 3 * t;
    const y = 95 - t * 58;
    const rot = -28 + t * 62;
    return <ellipse key={i} cx={x} cy={y} rx="3.4" ry="7.2" transform={`rotate(${rot} ${x} ${y})`} fill={fill} />;
  });
  return <g>{leaves}</g>;
}

function Crown({ rim1, rim2 }: { rim1: string; rim2: string }) {
  return (
    <g>
      <path d="M38 20 40 8 46 14 50 5 54 14 60 8 62 20z" fill={rim1} stroke={rim2} strokeWidth="1.2" strokeLinejoin="round" />
      <rect x="38" y="19" width="24" height="4" rx="1" fill={rim2} />
    </g>
  );
}

const SHIELD = "M31 24H69L82 35V68Q82 84 50 108Q18 84 18 68V35Z";
const PANEL = "M33.5 29H66.5L76.5 38V67Q76.5 80 50 100Q23.5 80 23.5 67V38Z";

function paletteFor(b: ParsedBadge): Palette {
  if (b.family === "CONSECUTIVE_DEPARTMENT") return PURPLE;
  if (b.category === "GROWTH") return GREEN;
  return BY_PLACE[b.place as Place];
}

function iconFor(b: ParsedBadge): string | null {
  if (b.family === "SCHOOL") return "school";
  if (b.family === "GLOBAL") return "globe";
  if (b.family === "CATEGORY") {
    const map: Record<CategoryId, string> = { RATING: "star", SELLER: "cart", READ: "book", FOLLOWED: "person", GROWTH: "trend" };
    return map[b.category as CategoryId];
  }
  return null; // Department / Consecutive show a numeral instead
}

export default function BadgeShield({
  badgeKey,
  periodType,
  periodKey,
  size = 96,
  datePill,
}: {
  badgeKey: string;
  periodType: "ALL_TIME" | "SEMESTER" | "YEAR";
  periodKey: string;
  size?: number;
  // Catalogue only: text for the date pill instead of a real date.
  datePill?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const b = parseBadgeKey(badgeKey);
  if (!b) return null;

  const pal = paletteFor(b);
  const icon = iconFor(b);
  const consecutive = b.family === "CONSECUTIVE_DEPARTMENT";
  // Numerals kept as drawn on the sheet: Department, Consecutive (III) and
  // Fastest Growing (a small tick under the arrow).
  const bigNumeral = b.family === "DEPARTMENT" ? NUMERAL[b.place as Place] : consecutive ? "III" : null;
  const tick = b.category === "GROWTH" ? NUMERAL[b.place as Place] : null;

  const placeText = consecutive ? "2x Dept. Leader" : placeLabel(b.place as Place);
  const tone = consecutive ? "purple" : b.place === 1 ? "gold" : b.place === 2 ? "silver" : "bronze";
  const date = datePill ?? badgeLabel(periodType, periodKey);
  const title = `${badgeTitle(badgeKey)} · ${date}`;

  return (
    <figure className="badge" title={title} aria-label={title}>
      <svg width={size} height={size * 1.2} viewBox="0 0 100 120" role="img" aria-hidden="true">
        <defs>
          <linearGradient id={`${uid}r`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={pal.rim1} />
            <stop offset="1" stopColor={pal.rim2} />
          </linearGradient>
          <linearGradient id={`${uid}p`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={pal.panel1} />
            <stop offset="1" stopColor={pal.panel2} />
          </linearGradient>
        </defs>

        <Laurel fill={pal.leaf} />
        <g transform="translate(100 0) scale(-1 1)">
          <Laurel fill={pal.leaf} />
        </g>
        <path d={SHIELD} fill={`url(#${uid}r)`} stroke={pal.rim2} strokeWidth="1.5" strokeLinejoin="round" />
        <path d={PANEL} fill={`url(#${uid}p)`} />
        <Crown rim1={pal.rim1} rim2={pal.rim2} />

        {icon && (
          <g transform={`translate(${tick ? 34 : 32} ${tick ? 39 : 43}) scale(${tick ? 1.35 : 1.5})`}>{ICONS[icon](pal.ink)}</g>
        )}
        {bigNumeral && (
          <text x="50" y={consecutive ? 69 : 72} textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" fontSize={bigNumeral.length > 2 ? 26 : 32} fill={pal.ink}>
            {bigNumeral}
          </text>
        )}
        {tick && (
          <text x="50" y="86" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" fontSize="8" fill={pal.ink} opacity="0.75">
            {tick}
          </text>
        )}
        {consecutive && (
          <g>
            <circle cx="50" cy="96" r="9" fill={pal.rim1} stroke={pal.rim2} strokeWidth="1.2" />
            <text x="50" y="100" textAnchor="middle" fontFamily="Georgia, serif" fontWeight="700" fontSize="11" fill="#2e1259">
              2x
            </text>
          </g>
        )}
      </svg>
      <figcaption>
        <span className={`badge-place badge-place--${tone}`}>{placeText}</span>
        <span className="badge-date">{date}</span>
      </figcaption>
    </figure>
  );
}
