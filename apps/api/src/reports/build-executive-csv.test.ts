import { describe, expect, it } from "vitest";

import { buildExecutiveReportCsv } from "./build-executive-csv.js";
import type { ExecutiveReportContext } from "./executive-data.js";

const baseCtx: ExecutiveReportContext = {
  factory_name: "Demo Plant",
  period_label: "2025-01",
  period_end: "2025-01-31",
  line_code: null,
  generated_at_iso: "2025-05-20T12:00:00.000Z",
  counts: {
    lines: 2,
    kpi_results: 10,
    validation_errors: 0,
    validation_warnings: 1,
    below_target: 2,
    below_peer_median: 3,
    insufficient_peer_sample: 0,
    targets_defined: 5,
  },
  priorities: [
    {
      kind: "below_target",
      line_code: "L1",
      ref_code: "scrap_rate",
      message: "Below factory KPI target",
      severity: "high",
      metric_value: "-0.01",
    },
  ],
  below_target: [],
  benchmark_gaps: [],
};

describe("buildExecutiveReportCsv", () => {
  it("includes UTF-8 BOM and factory metadata", () => {
    const csv = buildExecutiveReportCsv(baseCtx);
    expect(csv.startsWith("\uFEFF# FilmBench Executive Report")).toBe(true);
    expect(csv).toContain("Demo Plant");
    expect(csv).toContain("Summary counts");
    expect(csv).toContain("below_factory_target,2");
  });
});
