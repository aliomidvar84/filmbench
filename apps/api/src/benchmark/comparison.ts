import type { Pool } from "pg";

import { fetchBenchmarkRows } from "@filmbench/analytics";

import { classifyPerformanceBand, type PerformanceBand } from "./band.js";
import { computeConfidenceScore } from "./confidence.js";
import {
  estimatePercentileRank,
  percentileNarrative,
  type KpiDirection,
} from "./percentile.js";

export const WIDTH_BANDS = [
  "WIDTH_UNKNOWN",
  "WIDTH_0_3999",
  "WIDTH_4000_7999",
  "WIDTH_8000_10499",
  "WIDTH_10500_PLUS",
] as const;

export const COMPARISON_STATUSES = ["ok", "insufficient_peer_sample"] as const;

export interface BenchmarkFilterInput {
  reportingPeriodId: string;
  lineId?: string | null;
  lineType?: string | null;
  widthBand?: string | null;
  cohortKey?: string | null;
  comparisonStatus?: string | null;
}

export interface BenchmarkRowRaw {
  kpi_result_id: string;
  line_id: string;
  line_code: string;
  line_type: string;
  width_band: string;
  reporting_period_id: string;
  kpi_code: string;
  direction: KpiDirection;
  current_value: string | null;
  definition_unit: string;
  cohort_key: string;
  stored_cohort_key: string | null;
  peer_sample_size: number | null;
  peer_min: string | null;
  peer_max: string | null;
  peer_avg: string | null;
  peer_p10: string | null;
  peer_p25: string | null;
  peer_p50: string | null;
  peer_p75: string | null;
  peer_p90: string | null;
  best_practice_peer_value: string | null;
  gap_to_median_signed: string | null;
  gap_to_best_practice_signed: string | null;
  comparison_status: string;
}

export interface BenchmarkRowEnriched extends BenchmarkRowRaw {
  estimated_percentile: number | null;
  percentile_narrative: string;
  performance_band: PerformanceBand;
  confidence_score: number;
  cohort_key_used: string | null;
  primary_cohort_key: string | null;
  cohort_fallback_used: boolean;
}

export function parseBenchmarkFilters(url: URL): {
  filters: BenchmarkFilterInput | null;
  error?: string;
} {
  const reportingPeriodId =
    url.searchParams.get("reporting_period_id")?.trim() ?? "";
  if (!reportingPeriodId) {
    return { filters: null, error: "reporting_period_id_required" };
  }

  const lineIdRaw = url.searchParams.get("line_id")?.trim() ?? "";
  const lineType = url.searchParams.get("line_type")?.trim() ?? "";
  const widthBand = url.searchParams.get("width_band")?.trim() ?? "";
  const cohortKey = url.searchParams.get("cohort_key")?.trim() ?? "";
  const comparisonStatus =
    url.searchParams.get("comparison_status")?.trim() ?? "";

  if (
    widthBand &&
    !WIDTH_BANDS.includes(widthBand as (typeof WIDTH_BANDS)[number])
  ) {
    return { filters: null, error: "invalid_width_band" };
  }
  if (
    comparisonStatus &&
    !COMPARISON_STATUSES.includes(
      comparisonStatus as (typeof COMPARISON_STATUSES)[number],
    )
  ) {
    return { filters: null, error: "invalid_comparison_status" };
  }

  return {
    filters: {
      reportingPeriodId,
      lineId: lineIdRaw || null,
      lineType: lineType || null,
      widthBand: widthBand || null,
      cohortKey: cohortKey || null,
      comparisonStatus: comparisonStatus || null,
    },
  };
}

export function buildBenchmarkQuery(
  factoryId: string,
  filters: BenchmarkFilterInput,
): { sql: string; params: unknown[] } {
  const params: unknown[] = [factoryId, filters.reportingPeriodId];
  let clause = `WHERE v.factory_id = $1::uuid
       AND v.reporting_period_id = $2::uuid`;

  if (filters.lineId) {
    params.push(filters.lineId);
    clause += ` AND v.line_id = $${params.length}::uuid`;
  }
  if (filters.lineType) {
    params.push(filters.lineType);
    clause += ` AND upper(pl.line_type::text) = upper($${params.length})`;
  }
  if (filters.widthBand) {
    params.push(filters.widthBand);
    clause += ` AND ck.width_band = $${params.length}`;
  }
  if (filters.cohortKey) {
    params.push(filters.cohortKey);
    clause += ` AND COALESCE(ber.cohort_key_used, v.cohort_key) = $${params.length}`;
  }
  if (filters.comparisonStatus) {
    params.push(filters.comparisonStatus);
    clause += ` AND v.comparison_status = $${params.length}`;
  }

  const sql = `SELECT v.kpi_result_id::text AS kpi_result_id,
            v.line_id::text AS line_id,
            pl.line_code,
            upper(pl.line_type::text) AS line_type,
            ck.width_band,
            v.reporting_period_id::text AS reporting_period_id,
            v.kpi_code,
            v.direction,
            v.current_value::text AS current_value,
            v.definition_unit,
            COALESCE(ber.cohort_key_used, v.cohort_key) AS cohort_key,
            v.stored_cohort_key,
            COALESCE(ber.peer_sample_size, v.peer_sample_size) AS peer_sample_size,
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
            ber.cohort_key_used AS entity_cohort_key_used,
            COALESCE(ber.cohort_fallback_used, FALSE) AS cohort_fallback_used,
            ber.performance_band AS stored_performance_band,
            ber.confidence_score::text AS stored_confidence_score,
            ber.estimated_percentile::text AS stored_estimated_percentile
     FROM vw_kpi_benchmark_comparison v
     INNER JOIN production_lines pl ON pl.id = v.line_id
     INNER JOIN vw_line_cohort_keys ck ON ck.line_id = v.line_id
     LEFT JOIN benchmark_entity_results ber ON ber.kpi_result_id = v.kpi_result_id
     ${clause}
     ORDER BY pl.line_code, v.kpi_code`;

  return { sql, params };
}

type BenchmarkRowDb = BenchmarkRowRaw & {
  primary_cohort_key?: string | null;
  entity_cohort_key_used?: string | null;
  cohort_fallback_used?: boolean;
  stored_performance_band?: string | null;
  stored_confidence_score?: string | null;
  stored_estimated_percentile?: string | null;
};

function parseOptionalNum(raw: string | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function enrichBenchmarkRows(rows: BenchmarkRowRaw[]): BenchmarkRowEnriched[] {
  return (rows as BenchmarkRowDb[]).map((row) => {
    const {
      stored_performance_band: storedBandRaw,
      stored_confidence_score,
      stored_estimated_percentile,
      entity_cohort_key_used,
      primary_cohort_key: primaryCohort,
      cohort_fallback_used: fallbackFlag,
      ...base
    } = row;

    const estimated_percentile =
      parseOptionalNum(stored_estimated_percentile) ??
      estimatePercentileRank(
        base.current_value,
        base.peer_p10,
        base.peer_p25,
        base.peer_p50,
        base.peer_p75,
        base.peer_p90,
        base.direction,
      );

    const gapMedian = parseOptionalNum(base.gap_to_median_signed);
    const gapBest = parseOptionalNum(base.gap_to_best_practice_signed);

    const storedBand = storedBandRaw as PerformanceBand | null;
    const performance_band =
      storedBand &&
      ["leader", "average", "laggard", "unknown"].includes(storedBand)
        ? storedBand
        : classifyPerformanceBand(
            base.comparison_status,
            gapMedian,
            gapBest,
            estimated_percentile,
          );

    const storedConf = parseOptionalNum(stored_confidence_score);
    const confidence_score =
      storedConf ??
      computeConfidenceScore(base.peer_sample_size, base.comparison_status);

    return {
      ...base,
      estimated_percentile,
      percentile_narrative: percentileNarrative(
        estimated_percentile,
        base.comparison_status,
      ),
      performance_band,
      confidence_score,
      cohort_key_used: entity_cohort_key_used ?? base.cohort_key,
      primary_cohort_key: primaryCohort ?? base.cohort_key,
      cohort_fallback_used: Boolean(fallbackFlag),
    };
  });
}

export async function queryBenchmarkRows(
  pool: Pool,
  factoryId: string,
  filters: BenchmarkFilterInput,
): Promise<BenchmarkRowEnriched[]> {
  const { rows } = await fetchBenchmarkRows(pool, factoryId, filters, async () => {
    const { sql, params } = buildBenchmarkQuery(factoryId, filters);
    const { rows: pgRows } = await pool.query<BenchmarkRowRaw>(sql, params);
    return pgRows;
  });
  return enrichBenchmarkRows(rows as BenchmarkRowRaw[]);
}

export async function queryBenchmarkFilterOptions(
  pool: Pool,
  factoryId: string,
  reportingPeriodId: string,
): Promise<{
  line_types: string[];
  width_bands: string[];
  cohort_keys: string[];
}> {
  const { rows: lineTypes } = await pool.query<{ line_type: string }>(
    `SELECT DISTINCT upper(pl.line_type::text) AS line_type
     FROM vw_kpi_benchmark_comparison v
     INNER JOIN production_lines pl ON pl.id = v.line_id
     WHERE v.factory_id = $1::uuid AND v.reporting_period_id = $2::uuid
     ORDER BY 1`,
    [factoryId, reportingPeriodId],
  );
  const { rows: widthBands } = await pool.query<{ width_band: string }>(
    `SELECT DISTINCT ck.width_band
     FROM vw_kpi_benchmark_comparison v
     INNER JOIN vw_line_cohort_keys ck ON ck.line_id = v.line_id
     WHERE v.factory_id = $1::uuid AND v.reporting_period_id = $2::uuid
     ORDER BY 1`,
    [factoryId, reportingPeriodId],
  );
  const { rows: cohortKeys } = await pool.query<{ cohort_key: string }>(
    `SELECT DISTINCT v.cohort_key
     FROM vw_kpi_benchmark_comparison v
     WHERE v.factory_id = $1::uuid AND v.reporting_period_id = $2::uuid
     ORDER BY 1`,
    [factoryId, reportingPeriodId],
  );
  return {
    line_types: lineTypes.map((r) => r.line_type),
    width_bands: widthBands.map((r) => r.width_band),
    cohort_keys: cohortKeys.map((r) => r.cohort_key),
  };
}
