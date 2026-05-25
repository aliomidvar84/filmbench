import { describe, expect, it } from "vitest";

import { buildExecutiveReportPdf, estimateExecutiveReportBytes } from "./build-executive-pdf.js";
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
      ref_code: "SCRAP_RATE",
      message: "Below factory KPI target",
      severity: "high",
      metric_value: "-0.01",
    },
  ],
  below_target: [
    {
      line_code: "L1",
      kpi_code: "SCRAP_RATE",
      kpi_name: "Scrap rate",
      current_value: "0.06",
      target_value: "0.05",
      gap_to_target_signed: "0.01",
    },
  ],
  benchmark_gaps: [],
};

describe("buildExecutiveReportPdf", () => {
  it("returns a valid PDF buffer", async () => {
    const buf = await buildExecutiveReportPdf(baseCtx);
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("estimates PDF larger than CSV for same context", () => {
    const csvEst = estimateExecutiveReportBytes(baseCtx, "csv");
    const pdfEst = estimateExecutiveReportBytes(baseCtx, "pdf");
    expect(pdfEst).toBeGreaterThan(csvEst);
  });
});
