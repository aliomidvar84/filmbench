import { describe, expect, it } from "vitest";

import { parseBenchmarkFilters } from "./comparison.js";

describe("parseBenchmarkFilters", () => {
  it("requires reporting_period_id", () => {
    const r = parseBenchmarkFilters(new URL("http://x/b"));
    expect(r.error).toBe("reporting_period_id_required");
  });

  it("parses optional filters", () => {
    const r = parseBenchmarkFilters(
      new URL(
        "http://x/b?reporting_period_id=00000000-0000-4000-8000-000000000001&line_type=BOPP&width_band=WIDTH_0_3999&cohort_key=GLOBAL|BOPP|WIDTH_0_3999&comparison_status=ok",
      ),
    );
    expect(r.filters?.lineType).toBe("BOPP");
    expect(r.filters?.widthBand).toBe("WIDTH_0_3999");
    expect(r.filters?.comparisonStatus).toBe("ok");
  });
});
