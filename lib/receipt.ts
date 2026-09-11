// Generates a simple receipt image for a completed withdrawal — reuses
// @napi-rs/canvas, already a dependency from the protected PDF viewer
// feature. Same honesty note as that feature: written without the ability
// to actually run it in this sandbox (no network access to install/test
// against a real render), so treat exact canvas API calls as "very likely
// correct, verify once it actually runs" rather than guaranteed.

import { createCanvas } from "@napi-rs/canvas";

export interface ReceiptDetails {
  scribeName: string;
  amount: number; // Naira
  date: Date;
  reference: string;
  bankName: string;
  accountLast4: string;
}

export async function generateReceiptImage(details: ReceiptDetails): Promise<Buffer> {
  const width = 600;
  const height = 500;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#e1e8f0";
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, width - 40, height - 40);

  // Header
  ctx.fillStyle = "#1a2b3c";
  ctx.font = "bold 28px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Veloce", width / 2, 80);

  ctx.fillStyle = "#5e7188";
  ctx.font = "16px sans-serif";
  ctx.fillText("Payment Receipt", width / 2, 108);

  ctx.strokeStyle = "#e1e8f0";
  ctx.beginPath();
  ctx.moveTo(60, 130);
  ctx.lineTo(width - 60, 130);
  ctx.stroke();

  // Amount, front and center
  ctx.fillStyle = "#1b7e4a";
  ctx.font = "bold 42px sans-serif";
  ctx.fillText(`\u20a6${details.amount.toLocaleString()}`, width / 2, 195);

  // Details table
  const rows: [string, string][] = [
    ["Paid to", details.scribeName],
    ["Bank", details.bankName],
    ["Account", `\u2022\u2022\u2022\u2022 ${details.accountLast4}`],
    ["Date", details.date.toLocaleDateString()],
    ["Reference", details.reference],
  ];

  ctx.textAlign = "left";
  let y = 250;
  for (const [label, value] of rows) {
    ctx.fillStyle = "#5e7188";
    ctx.font = "14px sans-serif";
    ctx.fillText(label, 60, y);

    ctx.fillStyle = "#1a2b3c";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(value, width - 60, y);
    ctx.textAlign = "left";

    y += 35;
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#a3b1c2";
  ctx.font = "12px sans-serif";
  ctx.fillText("This is an automated receipt from Veloce.", width / 2, height - 40);

  return await canvas.encode("png");
}
