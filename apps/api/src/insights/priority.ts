import type { InsightSeverity } from "./types.js";

const SEVERITY_MULT: Record<InsightSeverity, number> = {
  info: 1,
  warning: 2,
  critical: 3,
};

export function computePriorityScore(
  severity: InsightSeverity,
  priorityWeight: number,
  gapMagnitude: number | null,
): number {
  const gap = gapMagnitude != null && Number.isFinite(gapMagnitude)
    ? Math.min(5, Math.max(0.1, Math.abs(gapMagnitude)))
    : 1;
  const raw = priorityWeight * SEVERITY_MULT[severity] * (1 + gap);
  return Math.round(raw * 100) / 100;
}
