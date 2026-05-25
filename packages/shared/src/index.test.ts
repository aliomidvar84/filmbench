import { describe, expect, it } from "vitest";

import { API_VERSION, formatRatioAsPercent } from "./index";

describe("@filmbench/shared", () => {
  it("exports API version", () => {
    expect(API_VERSION).toBe("v1");
  });

  it("formats decimal ratio as percent", () => {
    expect(formatRatioAsPercent(0.0725)).toBe("7.25%");
  });

  it("returns em dash for nullish ratios", () => {
    expect(formatRatioAsPercent(null)).toBe("—");
    expect(formatRatioAsPercent(undefined)).toBe("—");
  });
});
