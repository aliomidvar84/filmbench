/** Sprint 18 — approximate peer percentile from cohort distribution breakpoints. */

export type KpiDirection = "higher" | "lower";

function parseNum(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Linear interpolation between (v1,p1) and (v2,p2). */
function lerpPercentile(
  value: number,
  v1: number,
  p1: number,
  v2: number,
  p2: number,
): number {
  if (v2 === v1) return (p1 + p2) / 2;
  const t = (value - v1) / (v2 - v1);
  return p1 + t * (p2 - p1);
}

/**
 * Estimates percentile rank (0–100) from peer p10…p90 and current value.
 * Higher percentile = better performance for the KPI direction.
 */
export function estimatePercentileRank(
  currentRaw: string | number | null,
  p10Raw: string | number | null,
  p25Raw: string | number | null,
  p50Raw: string | number | null,
  p75Raw: string | number | null,
  p90Raw: string | number | null,
  direction: KpiDirection,
): number | null {
  const current = parseNum(currentRaw);
  const p10 = parseNum(p10Raw);
  const p25 = parseNum(p25Raw);
  const p50 = parseNum(p50Raw);
  const p75 = parseNum(p75Raw);
  const p90 = parseNum(p90Raw);
  if (current == null || p10 == null || p90 == null) return null;

  const points = [
    { v: p10, p: 10 },
    ...(p25 != null ? [{ v: p25, p: 25 }] : []),
    ...(p50 != null ? [{ v: p50, p: 50 }] : []),
    ...(p75 != null ? [{ v: p75, p: 75 }] : []),
    { v: p90, p: 90 },
  ].sort((a, b) => a.v - b.v);

  let rank: number;
  if (current <= points[0]!.v) {
    rank = points[0]!.p;
  } else if (current >= points[points.length - 1]!.v) {
    rank = points[points.length - 1]!.p;
  } else {
    rank = points[0]!.p;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]!;
      const next = points[i]!;
      if (current <= next.v) {
        rank = lerpPercentile(current, prev.v, prev.p, next.v, next.p);
        break;
      }
    }
  }

  const adjusted = direction === "lower" ? 100 - rank : rank;
  return Math.round(Math.min(100, Math.max(0, adjusted)) * 10) / 10;
}

export function percentileNarrative(
  percentile: number | null,
  comparisonStatus: string,
): string {
  if (comparisonStatus === "insufficient_peer_sample") {
    return "Insufficient peer sample (need ≥5 factories in cohort).";
  }
  if (percentile == null) return "Percentile unavailable.";
  if (percentile >= 75) return `You are around the ${percentile}th percentile — top quartile vs peers.`;
  if (percentile >= 50) return `You are around the ${percentile}th percentile — above median vs peers.`;
  if (percentile >= 25) return `You are around the ${percentile}th percentile — below median vs peers.`;
  return `You are around the ${percentile}th percentile — bottom quartile vs peers.`;
}
