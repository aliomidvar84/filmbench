/** Sprint 26 — ClickHouse feature flags and URL. */

export function clickhouseUrl(): string | null {
  const url = process.env.CLICKHOUSE_URL?.trim();
  return url || null;
}

export function isClickHouseEnabled(): boolean {
  const v = process.env.CLICKHOUSE_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function useClickHouseQueries(): boolean {
  if (!isClickHouseEnabled()) return false;
  const v = process.env.USE_CLICKHOUSE_QUERIES?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function clickhouseDatabase(): string {
  return process.env.CLICKHOUSE_DATABASE?.trim() || "filmbench";
}

/** Max rows per INSERT JSONEachRow batch (default 5000). */
export function clickhouseInsertBatchSize(): number {
  const n = Number(process.env.CLICKHOUSE_INSERT_BATCH_SIZE ?? "5000");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5000;
}

/** Parallel factory syncs for nightly job (default 2). */
export function analyticsSyncConcurrency(): number {
  const n = Number(process.env.ANALYTICS_SYNC_CONCURRENCY ?? "2");
  return Number.isFinite(n) && n >= 1 ? Math.min(8, Math.floor(n)) : 2;
}

/** Ms to wait for CH mutations after DELETE before INSERT (default 3000). */
export function clickhouseMutationWaitMs(): number {
  const n = Number(process.env.CLICKHOUSE_MUTATION_WAIT_MS ?? "3000");
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 3000;
}

/** Nightly scheduler: hour 0–23 UTC (default 2 = 02:00). */
export function analyticsCronHourUtc(): number {
  const n = Number(process.env.ANALYTICS_CRON_HOUR_UTC ?? "2");
  return Number.isFinite(n) ? Math.max(0, Math.min(23, Math.floor(n))) : 2;
}

export function analyticsCronMinuteUtc(): number {
  const n = Number(process.env.ANALYTICS_CRON_MINUTE_UTC ?? "0");
  return Number.isFinite(n) ? Math.max(0, Math.min(59, Math.floor(n))) : 0;
}
