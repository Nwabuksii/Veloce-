import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { WATERMARK_FONT_BASE64 } from "./watermark-font";

// Draws the chart pictures that go on the "Charts" sheet of an export.
// Same embedded font the watermark uses: Vercel has no system fonts, so
// canvas text with a generic family would silently render nothing there.

const FONT = "WatermarkFont";
function ensureFont() {
  if (GlobalFonts.has(FONT)) return;
  GlobalFonts.register(Buffer.from(WATERMARK_FONT_BASE64, "base64"), FONT);
}

export interface ChartSeries {
  name: string;
  values: number[];
  color: string;
}

export interface ChartSpec {
  title: string;
  labels: string[];
  series: ChartSeries[];
  kind: "bar" | "line";
  money?: boolean;
}

export const CHART_W = 760;
export const CHART_H = 380;

function niceMax(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

function short(v: number, money: boolean): string {
  const body =
    v >= 1_000_000 ? `${+(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${+(v / 1_000).toFixed(1)}k` : String(Math.round(v * 10) / 10);
  return money ? `₦${body}` : body;
}

export function renderChart(spec: ChartSpec): { buffer: Buffer; width: number; height: number } {
  ensureFont();
  const W = CHART_W;
  const H = CHART_H;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const font = (px: number) => `${px}px "${FONT}", sans-serif`;
  const money = Boolean(spec.money);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#111827";
  ctx.font = font(18);
  ctx.textAlign = "left";
  ctx.fillText(spec.title, 24, 32);

  // Legend (only when there is more than one series)
  if (spec.series.length > 1) {
    let x = 24;
    ctx.font = font(12);
    for (const s of spec.series) {
      ctx.fillStyle = s.color;
      ctx.fillRect(x, 46, 12, 12);
      ctx.fillStyle = "#374151";
      ctx.fillText(s.name, x + 18, 57);
      x += 18 + ctx.measureText(s.name).width + 22;
    }
  }

  const left = 76;
  const right = W - 24;
  const top = 76;
  const bottom = H - 48;
  const plotW = right - left;
  const plotH = bottom - top;

  const rawMax = Math.max(1, ...spec.series.flatMap((s) => s.values));
  const max = niceMax(rawMax);
  const intervals = !money && max < 5 ? max : 5;

  // Gridlines + y labels
  ctx.font = font(11);
  ctx.textAlign = "right";
  for (let i = 0; i <= intervals; i++) {
    const value = (max / intervals) * i;
    const y = bottom - (plotH * i) / intervals;
    ctx.strokeStyle = i === 0 ? "#9ca3af" : "#e5e7eb";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    ctx.fillStyle = "#6b7280";
    ctx.fillText(short(value, money), left - 8, y + 4);
  }

  const n = spec.labels.length;
  const groupW = plotW / Math.max(1, n);
  const yFor = (v: number) => bottom - (plotH * v) / max;

  // X labels
  ctx.textAlign = "center";
  ctx.fillStyle = "#6b7280";
  spec.labels.forEach((label, i) => ctx.fillText(label, left + groupW * (i + 0.5), bottom + 20));

  if (spec.kind === "bar") {
    const barW = (groupW * 0.7) / spec.series.length;
    spec.series.forEach((s, si) => {
      ctx.fillStyle = s.color;
      s.values.forEach((v, i) => {
        const x = left + groupW * i + groupW * 0.15 + barW * si;
        const y = yFor(v);
        ctx.fillRect(x, y, barW, bottom - y);
        if (spec.series.length === 1 && n <= 12 && v > 0) {
          ctx.fillStyle = "#374151";
          ctx.font = font(10);
          ctx.fillText(short(v, money), x + barW / 2, y - 5);
          ctx.fillStyle = s.color;
        }
      });
    });
  } else {
    for (const s of spec.series) {
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      s.values.forEach((v, i) => {
        const x = left + groupW * (i + 0.5);
        const y = yFor(v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      s.values.forEach((v, i) => {
        ctx.beginPath();
        ctx.arc(left + groupW * (i + 0.5), yFor(v), 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  return { buffer: canvas.toBuffer("image/png"), width: W, height: H };
}
