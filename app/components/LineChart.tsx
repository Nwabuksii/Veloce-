"use client";

import "./line-chart.css";

export interface LineSeries {
  name: string;
  color: string; // any CSS colour, e.g. "var(--gold)"
  values: (number | null)[];
  dashed?: boolean;
}

const W = 640;
const H = 260;
const PAD = { left: 54, right: 16, top: 14, bottom: 30 };

function niceMax(max: number): number {
  if (max <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

const compact = (n: number) => (Math.abs(n) >= 1000 ? `${Math.round((n / 1000) * 10) / 10}k` : String(Math.round(n)));

// A small dependency-free line chart. Scales to the screen width (SVG viewBox),
// shows a legend, gridlines, a dot per month and a native tooltip on each dot.
export default function LineChart({
  labels,
  series,
  format = (n) => n.toLocaleString(),
  yPrefix = "",
  emptyText = "No data yet.",
}: {
  labels: string[];
  series: LineSeries[];
  format?: (n: number) => string;
  yPrefix?: string;
  emptyText?: string;
}) {
  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const hasData = all.some((v) => v !== 0);
  const top = niceMax(Math.max(0, ...all));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (labels.length <= 1 ? innerW / 2 : (i / (labels.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * top);
  // Show about 6 month labels so they never overlap on a phone.
  const every = Math.max(1, Math.ceil(labels.length / 6));

  return (
    <div className="lc">
      <div className="lc-legend">
        {series.map((s) => (
          <span key={s.name}>
            <i className={`lc-key${s.dashed ? " is-dashed" : ""}`} style={{ borderColor: s.color }} /> {s.name}
          </span>
        ))}
      </div>
      {!hasData && <p className="lc-empty">{emptyText}</p>}
      <svg viewBox={`0 0 ${W} ${H}`} className="lc-svg" role="img" aria-label={series.map((s) => s.name).join(", ")}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="lc-grid" />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="lc-axis">
              {yPrefix}
              {compact(t)}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % every === 0 || i === labels.length - 1 ? (
            <text key={`${l}-${i}`} x={x(i)} y={H - 8} textAnchor="middle" className="lc-axis">
              {l}
            </text>
          ) : null
        )}
        {series.map((s) => {
          let d = "";
          let pen = false;
          s.values.forEach((v, i) => {
            if (v === null) {
              pen = false;
              return;
            }
            d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
            pen = true;
          });
          return (
            <g key={s.name}>
              <path d={d} className="lc-line" style={{ stroke: s.color }} strokeDasharray={s.dashed ? "6 5" : undefined} />
              {s.values.map((v, i) =>
                v === null ? null : (
                  <circle key={i} cx={x(i)} cy={y(v)} r={3.2} className="lc-dot" style={{ stroke: s.color }}>
                    <title>{`${s.name} · ${labels[i]}: ${format(v)}`}</title>
                  </circle>
                )
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
