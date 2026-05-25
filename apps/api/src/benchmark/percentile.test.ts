import { describe, expect, it } from "vitest";

import { estimatePercentileRank, percentileNarrative } from "./percentile.js";

describe("estimatePercentileRank", () => {
  it("ranks higher-is-better near median", () => {
    const p = estimatePercentileRank(0.5, 0.1, 0.3, 0.5, 0.7, 0.9, "higher");
    expect(p).not.toBeNull();
    expect(p!).toBeGreaterThan(40);
    expect(p!).toBeLessThan(60);
  });

  it("inverts for lower-is-better when value is low", () => {
    const p = estimatePercentileRank(0.05, 0.1, 0.2, 0.3, 0.4, 0.5, "lower");
    expect(p).not.toBeNull();
    expect(p!).toBeGreaterThan(50);
  });

  it("narrative for insufficient sample", () => {
    expect(percentileNarrative(null, "insufficient_peer_sample")).toContain(
      "Insufficient",
    );
  });
});
