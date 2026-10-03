import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { NO_STORE } from "@/lib/cache-policy";

// Shared plumbing for every Excel export (personal data, scribe earnings,
// admin finance): one look — bold dark header row, frozen, filterable,
// sensible widths, naira/date formats — so the files read like tables
// instead of raw dumps.

export type CellFormat = "text" | "int" | "naira" | "date" | "datetime" | "percent" | "rating";

export interface TableColumn {
  header: string;
  key: string;
  format?: CellFormat;
  width?: number;
}

export interface TableSheet {
  name: string;
  columns: TableColumn[];
  rows: Record<string, unknown>[];
}

export interface SummaryItem {
  label: string;
  value: string | number | Date | null;
  format?: CellFormat;
}

const NUM_FORMATS: Record<CellFormat, string | undefined> = {
  text: undefined,
  int: "#,##0",
  naira: '"₦"#,##0',
  date: "dd/mm/yyyy",
  datetime: "dd/mm/yyyy hh:mm",
  percent: '0.0"%"',
  rating: "0.0",
};

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" } };

// Excel sheet names: max 31 chars, none of  [ ] : * ? / \
const safeName = (name: string) => name.replace(/[\[\]:*?/\\]/g, " ").slice(0, 31);

function guessWidth(col: TableColumn, rows: Record<string, unknown>[]): number {
  if (col.format === "date") return 13;
  if (col.format === "datetime") return 18;
  let longest = col.header.length;
  for (const row of rows.slice(0, 200)) {
    const v = row[col.key];
    const len = v instanceof Date ? 12 : v == null ? 0 : String(v).length;
    if (len > longest) longest = len;
  }
  return Math.min(60, Math.max(12, longest + 2));
}

export function newWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Veloce";
  wb.created = new Date();
  return wb;
}

export function addTableSheet(wb: ExcelJS.Workbook, spec: TableSheet): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(safeName(spec.name));
  ws.columns = spec.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? guessWidth(c, spec.rows) }));

  if (spec.rows.length === 0) {
    ws.addRow({ [spec.columns[0].key]: "Nothing here yet" });
  } else {
    ws.addRows(spec.rows);
  }

  const header = ws.getRow(1);
  header.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  header.height = 22;

  spec.columns.forEach((c, i) => {
    const fmt = NUM_FORMATS[c.format ?? "text"];
    if (fmt) ws.getColumn(i + 1).numFmt = fmt;
  });

  ws.views = [{ state: "frozen", ySplit: 1 }];
  if (spec.rows.length > 0) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: spec.columns.length } };
  }
  return ws;
}

// A two-column "Item | Value" sheet with a title block on top — used for the
// Profile sheet and the Summary sheets.
export function addSummarySheet(wb: ExcelJS.Workbook, name: string, title: string, items: SummaryItem[]): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(safeName(name));
  ws.columns = [{ width: 38 }, { width: 28 }];

  ws.getCell("A1").value = title;
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.getCell("A2").value = `Generated ${new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`;
  ws.getCell("A2").font = { italic: true, color: { argb: "FF6B7280" } };

  const head = ws.getRow(4);
  head.values = ["Item", "Value"];
  head.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
  });

  items.forEach((item, i) => {
    const row = ws.getRow(5 + i);
    row.getCell(1).value = item.label;
    row.getCell(1).font = { bold: true };
    const valueCell = row.getCell(2);
    valueCell.value = item.value;
    valueCell.alignment = { horizontal: "left" };
    const fmt = NUM_FORMATS[item.format ?? "text"];
    if (fmt) valueCell.numFmt = fmt;
  });
  return ws;
}

// Charts are drawn as PNGs (lib/xlsx-charts.ts) and stacked down a "Charts"
// sheet. They are pictures, not live Excel charts — the table sheets next to
// them hold the real numbers.
export function addChartsSheet(wb: ExcelJS.Workbook, pngs: { buffer: Buffer; width: number; height: number }[]): void {
  if (pngs.length === 0) return;
  const ws = wb.addWorksheet("Charts");
  ws.getCell("A1").value = "Charts";
  ws.getCell("A1").font = { bold: true, size: 14 };
  let row = 2;
  for (const png of pngs) {
    const id = wb.addImage({ buffer: png.buffer as unknown as ExcelJS.Buffer, extension: "png" });
    ws.addImage(id, { tl: { col: 0, row }, ext: { width: png.width, height: png.height } });
    row += Math.ceil(png.height / 20) + 2; // default row height is 20px
  }
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function workbookResponse(wb: ExcelJS.Workbook, filename: string): Promise<NextResponse> {
  const buf = await wb.xlsx.writeBuffer();
  const clean = filename.toLowerCase().replace(/[^a-z0-9@._-]/g, "_");
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${clean}"`,
      "Cache-Control": NO_STORE,
    },
  });
}

export const todayStamp = () => new Date().toISOString().slice(0, 10);
