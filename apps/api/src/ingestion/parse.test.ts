import { describe, expect, it } from "vitest";

import { MONTHLY_EXCEL_HEADERS } from "./columns.js";
import { parseMonthlySheetFromMatrix, parseMonthlyWorkbook } from "./parse.js";
import { buildMonthlyTemplateBuffer } from "./template.js";

describe("parseMonthlySheetFromMatrix", () => {
  it("accepts a valid header and one data row", () => {
    const header = [...MONTHLY_EXCEL_HEADERS];
    const row = [
      "LINE-A",
      "2024-01-01",
      "2024-01-31",
      "1000",
      "950",
      "900",
      "40",
      "10",
      "700",
      "50",
      "30",
      "780",
      "120",
      "150",
      "5000",
      "100",
      "400",
      "200",
      "50",
      "10",
      "760",
      "5",
      "2",
      "1",
      "0",
      "EUR",
    ];
    const { rows, errors } = parseMonthlySheetFromMatrix([header, row]);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.line_code).toBe("LINE-A");
    expect(rows[0]?.period_start).toBe("2024-01-01");
    expect(rows[0]?.metrics.total_output_kg).toBe(950);
    expect(rows[0]?.metrics.currency_code).toBe("EUR");
  });

  it("reports unknown extra columns", () => {
    const header = [...MONTHLY_EXCEL_HEADERS, "notes"];
    const { errors } = parseMonthlySheetFromMatrix([header, []]);
    expect(errors.some((e) => e.message.includes("Unexpected column"))).toBe(true);
  });
});

describe("round-trip template workbook", () => {
  it("parses generated template without structural errors", () => {
    const buf = buildMonthlyTemplateBuffer();
    const { errors, rows } = parseMonthlyWorkbook(buf);
    expect(errors).toEqual([]);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
