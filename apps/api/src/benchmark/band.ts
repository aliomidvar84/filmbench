export type PerformanceBand = "leader" | "average" | "laggard" | "unknown";

export function classifyPerformanceBand(
  comparisonStatus: string,
  gapMedian: number | null,
  gapBest: number | null,
  percentile: number | null = null,
): PerformanceBand {
  if (comparisonStatus !== "ok") return "unknown";

  if (percentile != null && Number.isFinite(percentile)) {
    if (percentile >= 75) return "leader";
    if (percentile <= 25) return "laggard";
    return "average";
  }

  if (gapMedian == null || gapBest == null) return "unknown";
  if (gapMedian > 0 && gapBest >= 0) return "leader";
  if (gapMedian < 0 && gapBest < 0) return "laggard";
  return "average";
}
