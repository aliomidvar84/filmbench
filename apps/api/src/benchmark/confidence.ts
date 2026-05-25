export function computeConfidenceScore(
  peerSampleSize: number | null,
  comparisonStatus: string,
): number {
  if (comparisonStatus !== "ok") return 0;
  const n = peerSampleSize ?? 0;
  if (n < 5) return 0;
  if (n >= 20) return Math.min(1, 0.9 + (n - 20) / 200);
  if (n >= 10) return 0.75;
  return 0.55;
}
