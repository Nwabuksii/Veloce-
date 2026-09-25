if (typeof (Promise as any).withResolvers !== "function") {
  (Promise as any).withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

import { createCanvas, loadImage, GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";
import { WATERMARK_FONT_BASE64 } from "./watermark-font";
// @ts-ignore
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

class NodeCanvasFactory {
  create(width: number, height: number) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    return { canvas, context };
  }
  reset(canvasAndContext: any, width: number, height: number) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }
  destroy(canvasAndContext: any) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

const WATERMARK_FONT = "WatermarkFont";

// Registered once per server process. The font is embedded in the code (see
// watermark-font.ts) because Vercel has no system fonts to fall back on.
function ensureWatermarkFont() {
  if (GlobalFonts.has(WATERMARK_FONT)) return;
  GlobalFonts.register(Buffer.from(WATERMARK_FONT_BASE64, "base64"), WATERMARK_FONT);
  if (!GlobalFonts.has(WATERMARK_FONT)) console.error("Watermark font failed to register — watermark text will not render");
}

const RENDER_SCALE = 2.0;
const JPEG_QUALITY = 85;

export async function getPdfPageCount(pdfBuffer: Buffer): Promise<number> {
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
  const count = doc.numPages;
  await doc.destroy();
  return count;
}

export async function renderPdfPageToImage(pdfBuffer: Buffer, pageNum: number): Promise<Buffer> {
  const canvasFactory = new NodeCanvasFactory();
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    canvasFactory,
  } as any).promise;

  try {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale: RENDER_SCALE });

    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

    await page.render({ canvasContext: context, viewport, canvasFactory } as any).promise;

    return await canvas.encode("jpeg", JPEG_QUALITY);
  } finally {
    await doc.destroy();
  }
}

export async function renderPdfPagesToImages(pdfBuffer: Buffer, pageCount: number): Promise<Map<number, Buffer>> {
  const canvasFactory = new NodeCanvasFactory();
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    canvasFactory,
  } as any).promise;

  try {
    const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1);
    const pages = await Promise.all(
      pageNumbers.map(async (pageNum) => {
        const page = await doc.getPage(pageNum);
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const context = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

        await page.render({ canvasContext: context, viewport, canvasFactory } as any).promise;
        const image = await canvas.encode("jpeg", JPEG_QUALITY);
        return [pageNum, image] as const;
      })
    );

    return new Map(pages);
  } finally {
    await doc.destroy();
  }
}

export async function stampWatermark(baseImageBuffer: Buffer, lines: string[]): Promise<Buffer> {
  const img = await loadImage(baseImageBuffer);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d") as unknown as SKRSContext2D;

  ctx.drawImage(img as any, 0, 0, img.width, img.height);

  const text = lines.filter(Boolean).join("  ·  ");
  if (!text) {
    return await canvas.encode("jpeg", JPEG_QUALITY);
  }

  ensureWatermarkFont();

  ctx.save();

  // Small and unobtrusive: about 40% smaller than before (width/80 vs
  // width/45 — roughly 15px instead of 26px on a standard A4 page).
  const fontSize = Math.max(11, Math.round(img.width / 80));
  ctx.font = `${fontSize}px "WatermarkFont", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Highly transparent styling
  ctx.lineWidth = Math.max(1, Math.round(img.width / 700));
  ctx.strokeStyle = "rgba(255, 255, 255, 0.25)"; // 25% opacity white outline
  ctx.fillStyle = "rgba(15, 15, 15, 0.18)";      // 18% opacity dark fill

  ctx.shadowColor = "rgba(0, 0, 0, 0.1)"; // Very subtle shadow
  ctx.shadowBlur = 2;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;

  // Tighter grid spacing for "plenty" of repeats
  const stepX = img.width / 2.5;
  const stepY = img.height / 8;
  const angle = (-30 * Math.PI) / 180;

  // Expanded loop bounds to cover the entire canvas with a tighter grid
  for (let row = -2; row < 12; row++) {
    for (let col = -2; col < 6; col++) {
      const x = col * stepX + (row % 2 === 0 ? 0 : stepX / 2);
      const y = row * stepY;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      
      ctx.strokeText(text, 0, 0);
      ctx.fillText(text, 0, 0);
      
      ctx.restore();
    }
  }

  ctx.restore();

  return await canvas.encode("jpeg", JPEG_QUALITY);
}
