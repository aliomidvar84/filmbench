import type { Pool } from "pg";

import {
  analyticsSyncConcurrency,
  clickhouseDatabase,
  isClickHouseEnabled,
} from "./config.js";
import {
  escapeChString,
  execClickHouse,
  insertJsonEachRow,
  waitForClickHouseMutations,
} from "./client.js";
import { ensureClickHouseSchema } from "./schema.js";

export interface SyncAnalyticsResult {
  ok: boolean;
  skipped?: boolean;
  kpi_rows_synced: number;
  benchmark_rows_synced: number;
  sync_log_id?: string;
  error?: string;
}

function numOrNull(v: string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function syncFactoryAnalytics(
  pool: Pool,
  factoryId: string,
  reportingPeriodIds: string[] | null = null,
): Promise<SyncAnalyticsResult> {
  if (!isClickHouseEnabled()) {
    return {
      ok: true,
      skipped: true,
      kpi_rows_synced: 0,
      benchmark_rows_synced: 0,
    };
  }

  await ensureClickHouseSchema();
  const db = clickhouseDatabase();
  const fid = escapeChString(factoryId);

  const { rows: logRows } = await pool.query<{ id: string }>(
    `INSERT INTO analytics_sync_log (factory_id, sync_kind, reporting_period_ids, status)
     VALUES ($1::uuid, $2, $3::uuid[], 'running')
     RETURNING id::text AS id`,
    [
      factoryId,
      reportingPeriodIds?.length ? "incremental" : "full",
      reportingPeriodIds?.length ? reportingPeriodIds : null,
    ],
  );
  const syncLogId = logRows[0]?.id;

  try {
    const periodFilter =
      reportingPeriodIds && reportingPeriodIds.length > 0
        ? ` AND kr.reporting_period_id = ANY($2::uuid[])`
        : "";
    const kpiParams: unknown[] = [factoryId];
    if (reportingPeriodIds?.length) kpiParams.push(reportingPeriodIds);

    const { rows: kpiRows } = await pool.query<{
      factory_id: string;
      line_id: string;
      reporting_period_id: string;
      period_start: string;
      period_end: string;
      label: string | null;
      kpi_code: string;
      kpi_name: string;
      definition_unit: string;
      kpi_value: string;
      calculation_status: string;
    }>(
      `SELECT kr.factory_id::text,
              kr.line_id::text,
              kr.reporting_period_id::text,
              rp.period_start::date::text AS period_start,
              rp.period_end::date::text AS period_end,
              COALESCE(rp.label, '') AS label,
              kr.kpi_code,
              kd.name AS kpi_name,
              kd.unit AS definition_unit,
              kr.kpi_value::text AS kpi_value,
              kr.calculation_status
       FROM kpi_results kr
       INNER JOIN reporting_periods rp ON rp.id = kr.reporting_period_id
       INNER JOIN kpi_definitions kd ON kd.kpi_code = kr.kpi_code
       WHERE kr.factory_id = $1::uuid
         AND rp.period_type = 'monthly'${periodFilter}`,
      kpiParams,
    );

    const benchParams: unknown[] = [factoryId];
    let benchPeriodClause = "";
    if (reportingPeriodIds?.length) {
      benchParams.push(reportingPeriodIds);
      benchPeriodClause = ` AND v.reporting_period_id = ANY($2::uuid[])`;
    }

    const { rows: benchRows } = await pool.query<Record<string, string | null>>(
      `SELECT v.factory_id::text AS factory_id,
              v.reporting_period_id::text AS reporting_period_id,
              rp.period_end::date::text AS period_end,
              v.kpi_result_id::text AS kpi_result_id,
              v.line_id::text AS line_id,
              pl.line_code,
              upper(pl.line_type::text) AS line_type,
              ck.width_band,
              v.kpi_code,
              v.direction,
              v.current_value::text AS current_value,
              v.definition_unit,
              COALESCE(ber.cohort_key_used, v.cohort_key) AS cohort_key,
              v.stored_cohort_key,
              COALESCE(ber.peer_sample_size, v.peer_sample_size)::text AS peer_sample_size,
              v.peer_min::text AS peer_min,
              v.peer_max::text AS peer_max,
              v.peer_avg::text AS peer_avg,
              v.peer_p10::text AS peer_p10,
              v.peer_p25::text AS peer_p25,
              v.peer_p50::text AS peer_p50,
              v.peer_p75::text AS peer_p75,
              v.peer_p90::text AS peer_p90,
              v.best_practice_peer_value::text AS best_practice_peer_value,
              COALESCE(ber.gap_to_median_signed::text, v.gap_to_median_signed::text) AS gap_to_median_signed,
              COALESCE(ber.gap_to_best_practice_signed::text, v.gap_to_best_practice_signed::text) AS gap_to_best_practice_signed,
              COALESCE(ber.comparison_status, v.comparison_status) AS comparison_status,
              ber.primary_cohort_key,
              ber.cohort_key_used,
              COALESCE(ber.cohort_fallback_used, FALSE)::text AS cohort_fallback_used,
              ber.performance_band,
              ber.confidence_score::text AS confidence_score,
              ber.estimated_percentile::text AS estimated_percentile
       FROM vw_kpi_benchmark_comparison v
       INNER JOIN production_lines pl ON pl.id = v.line_id
       INNER JOIN reporting_periods rp ON rp.id = v.reporting_period_id
       INNER JOIN vw_line_cohort_keys ck ON ck.line_id = v.line_id
       LEFT JOIN benchmark_entity_results ber ON ber.kpi_result_id = v.kpi_result_id
       WHERE v.factory_id = $1::uuid${benchPeriodClause}`,
      benchParams,
    );

    let periodDeleteClause = "";
    if (reportingPeriodIds?.length) {
      const ids = reportingPeriodIds
        .map((id) => `toUUID('${escapeChString(id)}')`)
        .join(", ");
      periodDeleteClause = ` AND reporting_period_id IN (${ids})`;
    }

    await execClickHouse(
      `ALTER TABLE ${db}.kpi_monthly_fact DELETE WHERE factory_id = toUUID('${fid}')${periodDeleteClause}`,
    );
    await execClickHouse(
      `ALTER TABLE ${db}.benchmark_fact DELETE WHERE factory_id = toUUID('${fid}')${periodDeleteClause}`,
    );
    await Promise.all([
      waitForClickHouseMutations(`${db}.kpi_monthly_fact`),
      waitForClickHouseMutations(`${db}.benchmark_fact`),
    ]);

    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const kpiPayload = kpiRows.map((r) => ({
      factory_id: r.factory_id,
      line_id: r.line_id,
      reporting_period_id: r.reporting_period_id,
      period_start: r.period_start,
      period_end: r.period_end,
      label: r.label ?? "",
      kpi_code: r.kpi_code,
      kpi_name: r.kpi_name,
      definition_unit: r.definition_unit,
      kpi_value: Number(r.kpi_value),
      calculation_status: r.calculation_status,
      synced_at: now,
    }));

    const benchPayload = benchRows.map((r) => ({
      factory_id: r.factory_id,
      reporting_period_id: r.reporting_period_id,
      period_end: r.period_end,
      kpi_result_id: r.kpi_result_id,
      line_id: r.line_id,
      line_code: r.line_code ?? "",
      line_type: r.line_type ?? "",
      width_band: r.width_band ?? "WIDTH_UNKNOWN",
      kpi_code: r.kpi_code,
      direction: r.direction ?? "higher_is_better",
      current_value: numOrNull(r.current_value),
      definition_unit: r.definition_unit ?? "",
      cohort_key: r.cohort_key ?? "",
      stored_cohort_key: r.stored_cohort_key,
      peer_sample_size: Number(r.peer_sample_size ?? 0),
      peer_min: numOrNull(r.peer_min),
      peer_max: numOrNull(r.peer_max),
      peer_avg: numOrNull(r.peer_avg),
      peer_p10: numOrNull(r.peer_p10),
      peer_p25: numOrNull(r.peer_p25),
      peer_p50: numOrNull(r.peer_p50),
      peer_p75: numOrNull(r.peer_p75),
      peer_p90: numOrNull(r.peer_p90),
      best_practice_peer_value: numOrNull(r.best_practice_peer_value),
      gap_to_median_signed: numOrNull(r.gap_to_median_signed),
      gap_to_best_practice_signed: numOrNull(r.gap_to_best_practice_signed),
      comparison_status: r.comparison_status ?? "ok",
      primary_cohort_key: r.primary_cohort_key,
      cohort_key_used: r.cohort_key_used,
      cohort_fallback_used: r.cohort_fallback_used === "true" ? 1 : 0,
      performance_band: r.performance_band ?? "unknown",
      confidence_score: Number(r.confidence_score ?? 0),
      estimated_percentile: numOrNull(r.estimated_percentile),
      synced_at: now,
    }));

    await insertJsonEachRow("kpi_monthly_fact", kpiPayload);
    await insertJsonEachRow("benchmark_fact", benchPayload);

    if (syncLogId) {
      await pool.query(
        `UPDATE analytics_sync_log
         SET status = 'completed',
             kpi_rows_synced = $2,
             benchmark_rows_synced = $3,
             completed_at = now()
         WHERE id = $1::uuid`,
        [syncLogId, kpiRows.length, benchRows.length],
      );
    }

    return {
      ok: true,
      kpi_rows_synced: kpiRows.length,
      benchmark_rows_synced: benchRows.length,
      sync_log_id: syncLogId,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (syncLogId) {
      await pool
        .query(
          `UPDATE analytics_sync_log
           SET status = 'failed', error_message = $2, completed_at = now()
           WHERE id = $1::uuid`,
          [syncLogId, msg.slice(0, 2000)],
        )
        .catch(() => {});
    }
    return {
      ok: false,
      kpi_rows_synced: 0,
      benchmark_rows_synced: 0,
      sync_log_id: syncLogId,
      error: msg,
    };
  }
}

export interface SyncAllFactoriesResult {
  factories_total: number;
  factories_ok: number;
  factories_failed: number;
  kpi_rows_synced: number;
  benchmark_rows_synced: number;
  errors: { factory_id: string; error: string }[];
}

/** Nightly / CLI: sync every factory with bounded concurrency. */
export async function syncAllFactories(
  pool: Pool,
): Promise<SyncAllFactoriesResult> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id::text FROM factories ORDER BY factory_name`,
  );
  const concurrency = analyticsSyncConcurrency();
  const errors: { factory_id: string; error: string }[] = [];
  let factories_ok = 0;
  let kpi_rows_synced = 0;
  let benchmark_rows_synced = 0;

  for (let i = 0; i < rows.length; i += concurrency) {
    const chunk = rows.slice(i, i + concurrency);
    const results = await Promise.all(
      chunk.map((f) => syncFactoryAnalytics(pool, f.id, null)),
    );
    for (let j = 0; j < chunk.length; j++) {
      const r = results[j];
      const fid = chunk[j].id;
      if (r.ok && !r.skipped) {
        factories_ok += 1;
        kpi_rows_synced += r.kpi_rows_synced;
        benchmark_rows_synced += r.benchmark_rows_synced;
      } else if (!r.ok) {
        errors.push({ factory_id: fid, error: r.error ?? "sync_failed" });
      } else if (r.skipped) {
        factories_ok += 1;
      }
    }
  }

  return {
    factories_total: rows.length,
    factories_ok,
    factories_failed: errors.length,
    kpi_rows_synced,
    benchmark_rows_synced,
    errors,
  };
}

/** Fire-and-forget sync after ingestion/benchmark refresh. */
export function scheduleAnalyticsSync(
  pool: Pool,
  factoryId: string,
  reportingPeriodIds: string[] | null,
): void {
  if (!isClickHouseEnabled()) return;
  void syncFactoryAnalytics(pool, factoryId, reportingPeriodIds).catch((err) => {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "analytics_sync_failed",
        factory_id: factoryId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  });
}
