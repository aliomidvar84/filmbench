import * as XLSX from "xlsx";

import { MONTHLY_EXCEL_HEADERS } from "./columns.js";

export interface MonthlyFactMetrics {
  total_input_kg: number | null;
  total_output_kg: number | null;
  good_output_kg: number | null;
  scrap_kg: number | null;
  rework_kg: number | null;
  runtime_hours: number | null;
  planned_downtime_hours: number | null;
  unplanned_downtime_hours: number | null;
  total_available_hours: number | null;
  actual_speed: number | null;
  design_speed: number | null;
  total_energy_kwh: number | null;
  energy_cost_amount: number | null;
  raw_material_cost_amount: number | null;
  labor_cost_amount: number | null;
  overhead_cost_amount: number | null;
  other_cost_amount: number | null;
  total_cost_amount: number | null;
  startup_waste_kg: number | null;
  line_break_count: number;
  defect_count: number;
  changeover_count: number;
  currency_code: string;
}

export interface ParsedMonthlyExcelRow {
  sheetRow: number;
  line_code: string;
  period_start: string;
  period_end: string;
  metrics: MonthlyFactMetrics;
}

export interface ParseMonthlySheetResult {
  rows: ParsedMonthlyExcelRow[];
  errors: { sheetRow: number; message: string }[];
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function cellToIsoDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    const epoch = Date.UTC(1899, 11, 30);
    const d = new Date(epoch + value * 86400000);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return null;
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function parseNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string") {
    const t = value.trim().replace(",", ".");
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseNonNegativeInt(value: unknown, fallback: number): number {
  const n = parseNumber(value);
  if (n == null || !Number.isFinite(n) || n < 0) return fallback;
  const r = Math.round(n);
  if (Math.abs(r - n) > 1e-6) return fallback;
  return r;
}

function parseCurrency(value: unknown): string {
  const raw = String(value ?? "").trim().toUpperCase();
  if (raw.length >= 3) return raw.slice(0, 3);
  return "EUR";
}

function readRowObject(
  headerIndex: Map<string, number>,
  row: unknown[],
): { ok: true; obj: Record<string, unknown> } | { ok: false; message: string } {
  const obj: Record<string, unknown> = {};
  for (const h of MONTHLY_EXCEL_HEADERS) {
    const idx = headerIndex.get(h);
    if (idx === undefined) {
      return {
        ok: false,
        message: `Missing column "${h}" in header row.`,
      };
    }
    obj[h] = row[idx];
  }
  return { ok: true, obj };
}

function rowFromObject(
  sheetRow: number,
  o: Record<string, unknown>,
):
  | { ok: true; row: ParsedMonthlyExcelRow }
  | { ok: false; message: string } {
  const line_code = String(o.line_code ?? "").trim();
  if (!line_code) {
    return { ok: false, message: "line_code is required." };
  }
  const period_start = cellToIsoDate(o.period_start);
  const period_end = cellToIsoDate(o.period_end);
  if (!period_start || !period_end) {
    return { ok: false, message: "period_start and period_end must be valid dates." };
  }
  if (period_end < period_start) {
    return { ok: false, message: "period_end must be on or after period_start." };
  }

  const metrics: MonthlyFactMetrics = {
    total_input_kg: parseNumber(o.total_input_kg),
    total_output_kg: parseNumber(o.total_output_kg),
    good_output_kg: parseNumber(o.good_output_kg),
    scrap_kg: parseNumber(o.scrap_kg),
    rework_kg: parseNumber(o.rework_kg),
    runtime_hours: parseNumber(o.runtime_hours),
    planned_downtime_hours: parseNumber(o.planned_downtime_hours),
    unplanned_downtime_hours: parseNumber(o.unplanned_downtime_hours),
    total_available_hours: parseNumber(o.total_available_hours),
    actual_speed: parseNumber(o.actual_speed),
    design_speed: parseNumber(o.design_speed),
    total_energy_kwh: parseNumber(o.total_energy_kwh),
    energy_cost_amount: parseNumber(o.energy_cost_amount),
    raw_material_cost_amount: parseNumber(o.raw_material_cost_amount),
    labor_cost_amount: parseNumber(o.labor_cost_amount),
    overhead_cost_amount: parseNumber(o.overhead_cost_amount),
    other_cost_amount: parseNumber(o.other_cost_amount),
    total_cost_amount: parseNumber(o.total_cost_amount),
    startup_waste_kg: parseNumber(o.startup_waste_kg),
    line_break_count: parseNonNegativeInt(o.line_break_count, 0),
    defect_count: parseNonNegativeInt(o.defect_count, 0),
    changeover_count: parseNonNegativeInt(o.changeover_count, 0),
    currency_code: parseCurrency(o.currency_code),
  };

  return {
    ok: true,
    row: {
      sheetRow,
      line_code,
      period_start,
      period_end,
      metrics,
    },
  };
}

/** Parse first worksheet: row 1 = headers (must match template), row 2+ = data. Exported for tests. */
export function parseMonthlySheetFromMatrix(
  rows: unknown[][],
): ParseMonthlySheetResult {
  const errors: { sheetRow: number; message: string }[] = [];
  const parsed: ParsedMonthlyExcelRow[] = [];
  if (!rows.length) {
    errors.push({ sheetRow: 1, message: "Worksheet is empty." });
    return { rows: parsed, errors };
  }
  const headerCells = rows[0] ?? [];
  const headerIndex = new Map<string, number>();
  headerCells.forEach((cell, i) => {
    const key = normalizeHeader(cell);
    if (key) headerIndex.set(key, i);
  });
  const expected = new Set<string>(MONTHLY_EXCEL_HEADERS);
  for (const h of MONTHLY_EXCEL_HEADERS) {
    if (!headerIndex.has(h)) {
      errors.push({
        sheetRow: 1,
        message: `Missing required header "${h}". Download the latest template.`,
      });
    }
  }
  for (const key of headerIndex.keys()) {
    if (key && !expected.has(key)) {
      errors.push({
        sheetRow: 1,
        message: `Unexpected column "${key}". Remove extra columns or use the official template.`,
      });
    }
  }
  if (errors.length) {
    return { rows: parsed, errors };
  }

  for (let i = 1; i < rows.length; i++) {
    const sheetRow = i + 1;
    const row = rows[i] ?? [];
    const allEmpty = row.every(
      (c) => c == null || String(c).trim() === "",
    );
    if (allEmpty) continue;

    const ro = readRowObject(headerIndex, row);
    if (!ro.ok) {
      errors.push({ sheetRow, message: ro.message });
      continue;
    }
    const pr = rowFromObject(sheetRow, ro.obj);
    if (!pr.ok) {
      errors.push({ sheetRow, message: pr.message });
      continue;
    }
    parsed.push(pr.row);
  }

  if (!parsed.length && !errors.length) {
    errors.push({ sheetRow: 2, message: "No data rows found under the header." });
  }
  return { rows: parsed, errors };
}

export function parseMonthlyWorkbook(buffer: Buffer): ParseMonthlySheetResult {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return {
      rows: [],
      errors: [{ sheetRow: 1, message: "Workbook has no sheets." }],
    };
  }
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    return {
      rows: [],
      errors: [{ sheetRow: 1, message: "First sheet could not be read." }],
    };
  }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  }) as unknown[][];
  return parseMonthlySheetFromMatrix(rows);
}
