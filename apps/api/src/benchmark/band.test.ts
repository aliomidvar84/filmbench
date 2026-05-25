import { describe, expect, it } from "vitest";

import { classifyPerformanceBand } from "./band.js";

describe("classifyPerformanceBand", () => {
  it("returns unknown when peer sample insufficient", () => {
    expect(classifyPerformanceBand("insufficient_peer_sample", 1, 1)).toBe(
      "unknown",
    );
  });

  it("classifies leader from positive gaps", () => {
    expect(classifyPerformanceBand("ok", 0.02, 0.01)).toBe("leader");
  });

  it("classifies laggard from negative gaps", () => {
    expect(classifyPerformanceBand("ok", -0.02, -0.01)).toBe("laggard");
  });

  it("uses percentile when provided", () => {
    expect(classifyPerformanceBand("ok", 0, 0, 80)).toBe("leader");
    expect(classifyPerformanceBand("ok", 0, 0, 10)).toBe("laggard");
  });
});
