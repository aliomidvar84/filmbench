import { describe, expect, it } from "vitest";

import {
  deltaAbsolute,
  deltaPercent,
  periodTrendLabel,
} from "./period-delta.js";

describe("period deltas", () => {
  it("computes absolute and percent change", () => {
    expect(deltaAbsolute(0.9, 0.8)).toBeCloseTo(0.1);
    expect(deltaPercent(0.9, 0.8)).toBeCloseTo(0.125);
  });

  it("labels trend by KPI direction", () => {
    expect(periodTrendLabel("higher", 0.9, 0.8)).toBe("improved");
    expect(periodTrendLabel("higher", 0.7, 0.8)).toBe("worsened");
    expect(periodTrendLabel("lower", 0.05, 0.08)).toBe("improved");
    expect(periodTrendLabel("lower", 0.1, 0.08)).toBe("worsened");
    expect(periodTrendLabel("higher", null, 0.5)).toBe("no_current");
    expect(periodTrendLabel("higher", 0.5, null)).toBe("no_prior");
  });
});
