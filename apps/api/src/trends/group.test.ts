import { describe, expect, it } from "vitest";

import { groupKpiTrendRows, trendPeriodColumns, type RawTrendRow } from "./group.js";

describe("groupKpiTrendRows", () => {
  it("groups rows by kpi_code and sorts series alphabetically", () => {
    const rows: RawTrendRow[] = [
      {
        kpi_code: "OEE",
        kpi_name: "OEE",
        definition_unit: "ratio",
        reporting_period_id: "p1",
        period_start: "2024-01-01",
        period_end: "2024-01-31",
        label: "2024-01",
        kpi_value: "0.8",
        calculation_status: "ok",
      },
      {
        kpi_code: "SCRAP_RATE",
        kpi_name: "Scrap",
        definition_unit: "ratio",
        reporting_period_id: "p1",
        period_start: "2024-01-01",
        period_end: "2024-01-31",
        label: "2024-01",
        kpi_value: "0.05",
        calculation_status: "ok",
      },
      {
        kpi_code: "OEE",
        kpi_name: "OEE",
        definition_unit: "ratio",
        reporting_period_id: "p2",
        period_start: "2024-02-01",
        period_end: "2024-02-29",
        label: "2024-02",
        kpi_value: "0.81",
        calculation_status: "ok",
      },
    ];
    const series = groupKpiTrendRows(rows);
    expect(series.map((s) => s.kpi_code)).toEqual(["OEE", "SCRAP_RATE"]);
    const oee = series.find((s) => s.kpi_code === "OEE");
    expect(oee?.points).toHaveLength(2);
    expect(oee?.points[0]?.period_end).toBe("2024-01-31");
  });
});

describe("trendPeriodColumns", () => {
  it("returns sorted unique period columns", () => {
    const series = groupKpiTrendRows([
      {
        kpi_code: "OEE",
        kpi_name: "OEE",
        definition_unit: "ratio",
        reporting_period_id: "p2",
        period_start: "2024-02-01",
        period_end: "2024-02-29",
        label: null,
        kpi_value: "0.81",
        calculation_status: "ok",
      },
      {
        kpi_code: "OEE",
        kpi_name: "OEE",
        definition_unit: "ratio",
        reporting_period_id: "p1",
        period_start: "2024-01-01",
        period_end: "2024-01-31",
        label: null,
        kpi_value: "0.8",
        calculation_status: "ok",
      },
    ]);
    const cols = trendPeriodColumns(series);
    expect(cols.map((c) => c.period_end)).toEqual(["2024-01-31", "2024-02-29"]);
  });
});
