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

export async function stampWatermark(baseImageBuffer: Buffer, lines: string[]): Promise<Buffer> {
  const img = await loadImage(baseImageBuffer);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d") as unknown as SKRSContext2D;

  ctx.drawImage(img as any, 0, 0, img.width, img.height);

  const text = lines.filter(Boolean).join("  ·  ");
  if (!text) {
    return await canvas.encode("jpeg", JPEG_QUALITY);
  }

  // Fetch and register font dynamically for Vercel
  if (!GlobalFonts.has("WatermarkFont")) {
    try {
      const fontRes = await fetch("https://github.com/google/fonts/raw/main/ofl/roboto/Roboto-Bold.ttf");
      const fontBuffer = await fontRes.arrayBuffer();
      GlobalFonts.register(Buffer.from(fontBuffer), "WatermarkFont");
    } catch (e) {
      console.error("Failed to load font dynamically:", e);
    }
  }

  ctx.save();

  const fontSize = Math.max(24, Math.round(img.width / 22));
  ctx.font = `${fontSize}px "WatermarkFont", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Ultra-high contrast styling
  ctx.lineWidth = Math.max(6, Math.round(img.width / 150)); // Thicker outline
  ctx.strokeStyle = "rgba(255, 255, 255, 1)"; // Pure, solid white outline
  ctx.fillStyle = "rgba(15, 15, 15, 0.9)"; // Deep dark fill

  // Add a drop shadow for extra separation from the background
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 3;

  const stepX = img.width / 1.5;
  const stepY = img.height / 4;
  const angle = (-28 * Math.PI) / 180;

  for (let row = -1; row < 6; row++) {
    for (let col = -1; col < 4; col++) {
      const x = col * stepX + (row % 2 === 0 ? 0 : stepX / 2);
      const y = row * stepY;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      
      // Draw stroke first, then fill on top
      ctx.strokeText(text, 0, 0);
      ctx.fillText(text, 0, 0);
      
      ctx.restore();
    }
  }

  ctx.restore();

  return await canvas.encode("jpeg", JPEG_QUALITY);
}
