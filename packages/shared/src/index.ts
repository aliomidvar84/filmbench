/** Shared DTOs and constants for FilmBench (Sprint 0 — expand in later sprints). */

export const API_VERSION = "v1" as const;

export type AppEnvironment = "development" | "staging" | "production";

export type DatabaseHealthStatus = "ok" | "unconfigured" | "error";

export type HealthCheckKind = "live" | "ready";

export interface HealthPayload {
  ok: boolean;
  check: HealthCheckKind;
  service: string;
  version: string;
  environment: AppEnvironment;
  database: DatabaseHealthStatus;
  auth_configured: boolean;
  /** Sprint 26 — present when CLICKHOUSE_ENABLED */
  clickhouse?: DatabaseHealthStatus;
}

/**
 * KPI storage contract (Annex A3 §7): ratios are decimals in DB/API (e.g. 0.0725).
 * Use for UI copy (Annex A1 / A2 presentation).
 */
export function formatRatioAsPercent(
  value: number | null | undefined,
  fractionDigits = 2,
): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(fractionDigits)}%`;
}
