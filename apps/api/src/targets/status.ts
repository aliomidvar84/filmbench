export type TargetStatus =
  | "no_target"
  | "no_current_value"
  | "at_or_above_target"
  | "below_target";

export function gapToTargetSigned(
  direction: "higher" | "lower",
  current: number,
  target: number,
): number {
  return direction === "higher" ? current - target : target - current;
}

export function kpiTargetStatus(
  direction: "higher" | "lower",
  current: number | null,
  target: number | null,
): TargetStatus {
  if (target == null || Number.isNaN(target)) return "no_target";
  if (current == null || Number.isNaN(current)) return "no_current_value";
  if (direction === "higher") {
    return current >= target ? "at_or_above_target" : "below_target";
  }
  return current <= target ? "at_or_above_target" : "below_target";
}
