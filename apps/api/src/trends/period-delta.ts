/** Sprint 14 — period-over-period KPI delta helpers. */

export type PeriodTrendLabel =
  | "improved"
  | "worsened"
  | "unchanged"
  | "no_prior"
  | "no_current";

export function parseNumeric(raw: string | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function deltaAbsolute(
  current: number | null,
  prior: number | null,
): number | null {
  if (current == null || prior == null) return null;
  return current - prior;
}

export function deltaPercent(
  current: number | null,
  prior: number | null,
): number | null {
  if (current == null || prior == null || prior === 0) return null;
  return (current - prior) / Math.abs(prior);
}

export function periodTrendLabel(
  direction: "higher" | "lower",
  current: number | null,
  prior: number | null,
): PeriodTrendLabel {
  if (current == null) return "no_current";
  if (prior == null) return "no_prior";
  if (current === prior) return "unchanged";
  if (direction === "higher") {
    return current > prior ? "improved" : "worsened";
  }
  return current < prior ? "improved" : "worsened";
}
