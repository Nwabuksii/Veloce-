// Server-side PDF -> watermarked image pipeline.
//
// IMPORTANT CAVEAT: this file was written without the ability to actually
// run `npm install` or execute it against a real PDF in this environment —
// there's no network access here to pull pdfjs-dist / @napi-rs/canvas and
// no way to test the render output. The overall approach (pdfjs-dist +
// a Node canvas implementation, rendering to a canvas context) is the
// standard, widely-used pattern for server-side PDF rasterization, but the
// exact method names/signatures below (canvas.encode(), getDocument()'s
// options shape, etc.) should be treated as "very likely correct, but
// verify against whatever pdfjs-dist/@napi-rs/canvas versions actually
// install" rather than guaranteed. If something doesn't match once you
// run `npm install`, the fix is almost always a small signature tweak
// here, not a change to the overall architecture.

// pdfjs-dist v4 calls Promise.withResolvers() internally, which only
// exists natively in Node 22+. On an older Node runtime (18.x, most
// 20.x builds — common on serverless hosts that haven't been bumped
// yet), every single getDocument() call throws immediately with
// "Promise.withResolvers is not a function" — regardless of whether
// the PDF itself is fine. This polyfills it if it's missing, so PDF
// parsing doesn't depend on the exact Node version deployed.
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

import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
// @ts-ignore — pdfjs-dist's legacy Node build has no first-party types for this exact entry point
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

// pdf.js needs something that can hand it fresh canvases for internal
// operations (transparency groups, soft masks) beyond the one canvas we
// give it directly for the actual page output.
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

// Readable-on-screen resolution rather than print quality — keeps cached
// base images (and the bandwidth to serve them) small. ~1.4x a standard
// PDF page's default scale renders comfortably sharp on a phone screen.
const RENDER_SCALE = 1.4;
const JPEG_QUALITY = 80; // 0-100

export async function getPdfPageCount(pdfBuffer: Buffer): Promise<number> {
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
  const count = doc.numPages;
  await doc.destroy();
  return count;
}

/**
 * Renders one page of a PDF to a plain JPEG image (no watermark). This is
 * the expensive step — callers should cache the result (see
 * NotePageImage in the schema) rather than calling this more than once
 * per page per note.
 */
export async function renderPdfPageToImage(pdfBuffer: Buffer, pageNum: number): Promise<Buffer> {
  const canvasFactory = new NodeCanvasFactory();
  // `canvasFactory` is a real, supported option at runtime in pdfjs-dist's
  // Node build, but its bundled TypeScript types don't declare it — hence
  // the cast rather than a change in behavior.
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

/**
 * Stamps a tiled, diagonal watermark over an already-rendered page image.
 * Cheap relative to the PDF render itself, so this runs fresh on every
 * view — the result must never be cached, since it's personalized to
 * whoever's looking.
 */
export async function stampWatermark(baseImageBuffer: Buffer, lines: string[]): Promise<Buffer> {
  const img = await loadImage(baseImageBuffer);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d") as unknown as SKRSContext2D;

  ctx.drawImage(img as any, 0, 0, img.width, img.height);

  const text = lines.join("  ·  ");

  ctx.save();
  ctx.font = `${Math.max(14, Math.round(img.width / 42))}px sans-serif`;
  // Slightly stronger than before (0.16 -> 0.22) and noticeably denser
  // tiling below — a screenshot of any corner of the page should still
  // clearly carry the watermark, not just the odd fragment of it.
  ctx.fillStyle = "rgba(30, 30, 30, 0.22)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const stepX = img.width / 1.6;
  const stepY = img.height / 4.5;
  const angle = (-28 * Math.PI) / 180;

  for (let row = -1; row < 7; row++) {
    for (let col = -1; col < 4; col++) {
      const x = col * stepX + (row % 2 === 0 ? 0 : stepX / 2);
      const y = row * stepY;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
  }

  ctx.restore();

  return await canvas.encode("jpeg", JPEG_QUALITY);
}