import { describe, expect, it } from "vitest";

import { gapToTargetSigned, kpiTargetStatus } from "./status.js";

describe("kpiTargetStatus", () => {
  it("higher-is-better: at or above target", () => {
    expect(kpiTargetStatus("higher", 0.9, 0.85)).toBe("at_or_above_target");
    expect(kpiTargetStatus("higher", 0.85, 0.85)).toBe("at_or_above_target");
    expect(kpiTargetStatus("higher", 0.8, 0.85)).toBe("below_target");
  });

  it("lower-is-better: at or below target", () => {
    expect(kpiTargetStatus("lower", 0.05, 0.08)).toBe("at_or_above_target");
    expect(kpiTargetStatus("lower", 0.1, 0.08)).toBe("below_target");
  });

  it("missing values", () => {
    expect(kpiTargetStatus("higher", null, 1)).toBe("no_current_value");
    expect(kpiTargetStatus("higher", 1, null)).toBe("no_target");
  });
});

describe("gapToTargetSigned", () => {
  it("signs gap by direction", () => {
    expect(gapToTargetSigned("higher", 0.9, 0.85)).toBeCloseTo(0.05);
    expect(gapToTargetSigned("lower", 0.05, 0.08)).toBeCloseTo(0.03);
  });
});
