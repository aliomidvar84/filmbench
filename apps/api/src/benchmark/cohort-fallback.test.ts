import { describe, expect, it } from "vitest";

import { buildCohortFallbackKeys } from "./cohort-fallback.js";

describe("buildCohortFallbackKeys", () => {
  it("orders primary then relaxed width then global", () => {
    const keys = buildCohortFallbackKeys(
      "EU|BOPP|WIDTH_8000_10499",
      "EU",
      "BOPP",
      "WIDTH_8000_10499",
    );
    expect(keys[0]).toBe("EU|BOPP|WIDTH_8000_10499");
    expect(keys).toContain("EU|BOPP|WIDTH_UNKNOWN");
    expect(keys[keys.length - 1]).toBe("GLOBAL|BOPP|WIDTH_UNKNOWN");
  });

  it("deduplicates when primary is already global unknown width", () => {
    const keys = buildCohortFallbackKeys(
      "GLOBAL|BOPET|WIDTH_UNKNOWN",
      "GLOBAL",
      "BOPET",
      "WIDTH_UNKNOWN",
    );
    expect(keys.length).toBeGreaterThanOrEqual(1);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
