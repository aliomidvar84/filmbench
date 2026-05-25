import type { Pool } from "pg";

import { clickhouseDatabase, useClickHouseQueries } from "../config.js";
import { escapeChString, pingClickHouse, queryClickHouseJson } from "../client.js";

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
  direction: string;
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

function strOrNull(n: number | string | null | undefined): string | null {
  if (n == null || n === "") return null;
  return String(n);
}

async function queryBenchmarkFromClickHouse(
  factoryId: string,
  filters: BenchmarkFilterInput,
): Promise<BenchmarkRowRaw[] | null> {
  if (!useClickHouseQueries()) return null;
  if ((await pingClickHouse()) !== "ok") return null;

  const db = clickhouseDatabase();
  const clauses: string[] = [
    `factory_id = toUUID('${escapeChString(factoryId)}')`,
    `reporting_period_id = toUUID('${escapeChString(filters.reportingPeriodId)}')`,
  ];
  if (filters.lineId) {
    clauses.push(`line_id = toUUID('${escapeChString(filters.lineId)}')`);
  }
  if (filters.lineType) {
    clauses.push(
      `upper(line_type) = upper('${escapeChString(filters.lineType)}')`,
    );
  }
  if (filters.widthBand) {
    clauses.push(`width_band = '${escapeChString(filters.widthBand)}'`);
  }
  if (filters.cohortKey) {
    clauses.push(`cohort_key = '${escapeChString(filters.cohortKey)}'`);
  }
  if (filters.comparisonStatus) {
    clauses.push(
      `comparison_status = '${escapeChString(filters.comparisonStatus)}'`,
    );
  }

  const sql = `
SELECT toString(kpi_result_id) AS kpi_result_id,
       toString(line_id) AS line_id,
       line_code,
       line_type,
       width_band,
       toString(reporting_period_id) AS reporting_period_id,
       kpi_code,
       direction,
       ifNull(toString(current_value), NULL) AS current_value,
       definition_unit,
       cohort_key,
       ifNull(toString(stored_cohort_key), NULL) AS stored_cohort_key,
       peer_sample_size,
       ifNull(toString(peer_min), NULL) AS peer_min,
       ifNull(toString(peer_max), NULL) AS peer_max,
       ifNull(toString(peer_avg), NULL) AS peer_avg,
       ifNull(toString(peer_p10), NULL) AS peer_p10,
       ifNull(toString(peer_p25), NULL) AS peer_p25,
       ifNull(toString(peer_p50), NULL) AS peer_p50,
       ifNull(toString(peer_p75), NULL) AS peer_p75,
       ifNull(toString(peer_p90), NULL) AS peer_p90,
       ifNull(toString(best_practice_peer_value), NULL) AS best_practice_peer_value,
       ifNull(toString(gap_to_median_signed), NULL) AS gap_to_median_signed,
       ifNull(toString(gap_to_best_practice_signed), NULL) AS gap_to_best_practice_signed,
       comparison_status
FROM ${db}.benchmark_fact FINAL
WHERE ${clauses.join(" AND ")}
ORDER BY line_code, kpi_code`;

  const rows = await queryClickHouseJson<Record<string, unknown>>(sql);
  return rows.map((r) => ({
    kpi_result_id: String(r.kpi_result_id),
    line_id: String(r.line_id),
    line_code: String(r.line_code),
    line_type: String(r.line_type),
    width_band: String(r.width_band),
    reporting_period_id: String(r.reporting_period_id),
    kpi_code: String(r.kpi_code),
    direction: String(r.direction),
    current_value: strOrNull(r.current_value as string | number | null),
    definition_unit: String(r.definition_unit),
    cohort_key: String(r.cohort_key),
    stored_cohort_key: strOrNull(r.stored_cohort_key as string | null),
    peer_sample_size:
      r.peer_sample_size != null ? Number(r.peer_sample_size) : null,
    peer_min: strOrNull(r.peer_min as string | number | null),
    peer_max: strOrNull(r.peer_max as string | number | null),
    peer_avg: strOrNull(r.peer_avg as string | number | null),
    peer_p10: strOrNull(r.peer_p10 as string | number | null),
    peer_p25: strOrNull(r.peer_p25 as string | number | null),
    peer_p50: strOrNull(r.peer_p50 as string | number | null),
    peer_p75: strOrNull(r.peer_p75 as string | number | null),
    peer_p90: strOrNull(r.peer_p90 as string | number | null),
    best_practice_peer_value: strOrNull(
      r.best_practice_peer_value as string | number | null,
    ),
    gap_to_median_signed: strOrNull(
      r.gap_to_median_signed as string | number | null,
    ),
    gap_to_best_practice_signed: strOrNull(
      r.gap_to_best_practice_signed as string | number | null,
    ),
    comparison_status: String(r.comparison_status),
  }));
}

export async function fetchBenchmarkRows(
  pool: Pool,
  factoryId: string,
  filters: BenchmarkFilterInput,
  postgresQuery: () => Promise<BenchmarkRowRaw[]>,
): Promise<{ rows: BenchmarkRowRaw[]; source: "clickhouse" | "postgres" }> {
  try {
    const ch = await queryBenchmarkFromClickHouse(factoryId, filters);
    if (ch && ch.length > 0) {
      return { rows: ch, source: "clickhouse" };
    }
  } catch {
    /* fallback */
  }
  const rows = await postgresQuery();
  return { rows, source: "postgres" };
}
