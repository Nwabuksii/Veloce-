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
import { mapLimit, withTimeout } from "./async-limits";
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

// ---- Work limits -----------------------------------------------------------
// A PDF is untrusted input: a few KB can declare a page the size of a
// billboard, or hundreds of pages. Everything below keeps one file from
// eating the server's memory or CPU.
export const MAX_PDF_PAGES = 300;
// Pages declared bigger than this (in PDF points, 72 = 1 inch; A4 is 595x842)
// are refused at upload. Anything smaller but still large is rendered at a
// reduced scale (see safeScale) rather than refused.
export const MAX_PAGE_POINTS = 5000;
const MAX_RENDER_PIXELS_PER_SIDE = 4096;
const MAX_RENDER_PIXELS_TOTAL = 12_000_000; // an A4 page at 2x is about 2M
const MAX_IMAGE_PIXELS = 16_000_000; // largest single embedded image pdf.js will decode
const RENDER_CONCURRENCY = 3; // pages rendered at the same time
const PAGE_RENDER_TIMEOUT_MS = 15_000; // one page
const JOB_TIME_LIMIT_MS = 45_000; // a whole render or inspection

/** A PDF that breaks one of the limits above — safe to show to the user. */
export class PdfLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfLimitError";
  }
}

function openDocument(pdfBuffer: Buffer, extra: Record<string, unknown> = {}) {
  return pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    // Defence in depth: never let pdf.js compile document-supplied code
    // with eval/new Function (the class of bug behind CVE-2024-4367).
    isEvalSupported: false,
    maxImageSize: MAX_IMAGE_PIXELS,
    ...extra,
  } as any).promise;
}

// Picks the render scale for a page: the normal 2x, shrunk if that would
// exceed the pixel limits, so a tiny file can't make us allocate a huge canvas.
function safeScale(width: number, height: number): number {
  const bySide = MAX_RENDER_PIXELS_PER_SIDE / Math.max(width, height);
  const byArea = Math.sqrt(MAX_RENDER_PIXELS_TOTAL / (width * height));
  return Math.min(RENDER_SCALE, bySide, byArea);
}

function safeViewport(page: any) {
  const base = page.getViewport({ scale: 1 });
  if (!(base.width > 0 && base.height > 0)) throw new PdfLimitError("This PDF has a page with no size.");
  return page.getViewport({ scale: safeScale(base.width, base.height) });
}

async function renderPageToJpeg(page: any, canvasFactory: NodeCanvasFactory): Promise<Buffer> {
  const viewport = safeViewport(page);
  const canvas = createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
  const context = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  const task = page.render({ canvasContext: context, viewport, canvasFactory } as any);
  try {
    await withTimeout(task.promise, PAGE_RENDER_TIMEOUT_MS, "Rendering a page");
  } catch (err) {
    task.cancel?.(); // stop pdf.js working on a page we've given up on
    throw err;
  }
  return await canvas.encode("jpeg", JPEG_QUALITY);
}

export async function getPdfPageCount(pdfBuffer: Buffer): Promise<number> {
  const doc = await openDocument(pdfBuffer);
  const count = doc.numPages;
  await doc.destroy();
  return count;
}

/**
 * Upload-time check: opens the PDF the way the renderer will and enforces the
 * page-count and page-size limits before anything is stored. Throws
 * PdfLimitError for a limit, or whatever pdf.js throws for a corrupt file.
 */
export async function inspectPdf(pdfBuffer: Buffer): Promise<{ pageCount: number }> {
  const doc = await openDocument(pdfBuffer);
  try {
    const pageCount: number = doc.numPages;
    if (pageCount > MAX_PDF_PAGES) {
      throw new PdfLimitError(`PDF has too many pages (${pageCount}) — max ${MAX_PDF_PAGES}. Split it into smaller blocks.`);
    }

    const deadline = Date.now() + JOB_TIME_LIMIT_MS;
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      if (Date.now() > deadline) throw new PdfLimitError("This PDF took too long to check. Try a simpler or smaller file.");
      const page = await doc.getPage(pageNum);
      const { width, height } = page.getViewport({ scale: 1 });
      page.cleanup();
      if (!(width > 0 && height > 0)) throw new PdfLimitError(`Page ${pageNum} has no size.`);
      if (width > MAX_PAGE_POINTS || height > MAX_PAGE_POINTS) {
        throw new PdfLimitError(`Page ${pageNum} is unusually large. Please export the notes at a normal page size.`);
      }
    }
    return { pageCount };
  } finally {
    await doc.destroy();
  }
}

export async function renderPdfPageToImage(pdfBuffer: Buffer, pageNum: number): Promise<Buffer> {
  const canvasFactory = new NodeCanvasFactory();
  const doc = await openDocument(pdfBuffer, { canvasFactory });

  try {
    const page = await doc.getPage(pageNum);
    try {
      return await renderPageToJpeg(page, canvasFactory);
    } finally {
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
}

export async function renderPdfPagesToImages(pdfBuffer: Buffer, pageCount: number): Promise<Map<number, Buffer>> {
  if (pageCount > MAX_PDF_PAGES) {
    throw new PdfLimitError(`PDF has too many pages (${pageCount}) — max ${MAX_PDF_PAGES}.`);
  }

  const canvasFactory = new NodeCanvasFactory();
  const doc = await openDocument(pdfBuffer, { canvasFactory });
  const deadline = Date.now() + JOB_TIME_LIMIT_MS;

  try {
    const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1);
    // A few pages at a time instead of all of them at once: every in-flight
    // page holds a full-size canvas in memory.
    const pages = await mapLimit(pageNumbers, RENDER_CONCURRENCY, async (pageNum) => {
      if (Date.now() > deadline) throw new PdfLimitError("Rendering this PDF took too long.");
      const page = await doc.getPage(pageNum);
      try {
        return [pageNum, await renderPageToJpeg(page, canvasFactory)] as const;
      } finally {
        page.cleanup();
      }
    });

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
