import { describe, expect, it } from "vitest";

/** Mirrors evaluate.ts min_gap gate for below_peer_median. */
function passesMinGap(gapSigned: number, minGap: number): boolean {
  if (!Number.isFinite(gapSigned) || gapSigned >= 0) return false;
  const gapMag = Math.abs(gapSigned);
  if (Number.isFinite(minGap) && gapMag < minGap) return false;
  return true;
}

describe("insight threshold min_gap", () => {
  it("filters small gaps when min_gap is set", () => {
    expect(passesMinGap(-0.001, 0.01)).toBe(false);
    expect(passesMinGap(-0.02, 0.01)).toBe(true);
  });

  it("allows any negative gap when min_gap is zero", () => {
    expect(passesMinGap(-0.001, 0)).toBe(true);
  });
});
