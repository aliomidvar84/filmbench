/** A5 §20 — ordered cohort keys to try when primary peer sample is too small. */
export function buildCohortFallbackKeys(
  primaryCohortKey: string,
  cohortRegion: string,
  lineType: string,
  widthBand: string,
): string[] {
  const region = cohortRegion.trim() || "GLOBAL";
  const lt = lineType.trim().toUpperCase();
  const wb = widthBand.trim() || "WIDTH_UNKNOWN";
  const keys = [
    primaryCohortKey,
    `${region}|${lt}|WIDTH_UNKNOWN`,
    `GLOBAL|${lt}|${wb}`,
    `GLOBAL|${lt}|WIDTH_UNKNOWN`,
  ];
  return [...new Set(keys)];
}
