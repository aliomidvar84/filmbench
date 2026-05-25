import { describe, expect, it } from "vitest";

import { calculateImpact } from "./impact.js";
import { mergeImpactParams } from "./impact-params.js";

const baseParams = mergeImpactParams(
  {
    currency_code: "EUR",
    margin_per_kg: 1,
    energy_cost_per_kwh: 0.1,
    default_monthly_output_kg: 100000,
  },
  { monthly_output_kg: 100000 },
);

describe("calculateImpact", () => {
  it("computes scrap value from gap ratio", () => {
    const r = calculateImpact("SCRAP_RATE", -0.02, "ratio", baseParams);
    expect(r.scrap_proxy_kg).toBe(2000);
    expect(r.scrap_value).toBe(2000);
    expect(r.total_value).toBe(2000);
  });

  it("computes energy cost when above peers", () => {
    const r = calculateImpact("ENERGY_PER_KG", -0.5, "kwh_per_kg", baseParams);
    expect(r.energy_kwh_saved).toBe(50000);
    expect(r.energy_value).toBe(5000);
  });
});
