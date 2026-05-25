import { describe, expect, it } from "vitest";

import { computeConfidenceScore } from "./confidence.js";

describe("computeConfidenceScore", () => {
  it("returns zero for insufficient sample", () => {
    expect(computeConfidenceScore(3, "insufficient_peer_sample")).toBe(0);
    expect(computeConfidenceScore(4, "ok")).toBe(0);
  });

  it("increases with sample size", () => {
    expect(computeConfidenceScore(8, "ok")).toBe(0.55);
    expect(computeConfidenceScore(15, "ok")).toBe(0.75);
    expect(computeConfidenceScore(30, "ok")).toBeGreaterThan(0.9);
  });
});
