import type { Pool } from "pg";

import {
  enrichBenchmarkRows,
  type BenchmarkRowEnriched,
} from "../benchmark/comparison.js";

export interface BelowTargetRow {
  line_id: string;
  line_code: string;
  kpi_code: string;
  kpi_name: string;
  definition_unit: string;
  current_value: string;
  target_value: string;
  gap_to_target_signed: string;
}

export interface ValidationRow {
  line_id: string;
  line_code: string;
  issue_code: string;
  issue_message: string;
  issue_severity: string;
}

export interface EvaluationContext {
  benchmark: BenchmarkRowEnriched[];
  belowTarget: BelowTargetRow[];
  validationErrors: ValidationRow[];
  validationWarnings: ValidationRow[];
}

export async function loadEvaluationContext(
  pool: Pool,
  factoryId: string,
  reportingPeriodId: string,
  lineId: string | null,
): Promise<EvaluationContext> {
  const { rows: benchRaw } = await pool.query(
    `SELECT v.kpi_result_id::text AS kpi_result_id,
            v.line_id::text AS line_id,
            pl.line_code,
            upper(pl.line_type::text) AS line_type,
            ck.width_band,
            v.reporting_period_id::text AS reporting_period_id,
            v.kpi_code,
            v.direction,
            v.current_value::text AS current_value,
            v.definition_unit,
            v.cohort_key,
            v.stored_cohort_key,
            v.peer_sample_size,
            v.peer_min::text AS peer_min,
            v.peer_max::text AS peer_max,
            v.peer_avg::text AS peer_avg,
            v.peer_p10::text AS peer_p10,
            v.peer_p25::text AS peer_p25,
            v.peer_p50::text AS peer_p50,
            v.peer_p75::text AS peer_p75,
            v.peer_p90::text AS peer_p90,
            v.best_practice_peer_value::text AS best_practice_peer_value,
            v.gap_to_median_signed::text AS gap_to_median_signed,
            v.gap_to_best_practice_signed::text AS gap_to_best_practice_signed,
            v.comparison_status
     FROM vw_kpi_benchmark_comparison v
     INNER JOIN production_lines pl ON pl.id = v.line_id
     INNER JOIN vw_line_cohort_keys ck ON ck.line_id = v.line_id
     WHERE v.factory_id = $1::uuid
       AND v.reporting_period_id = $2::uuid
       ${lineId ? "AND v.line_id = $3::uuid" : ""}`,
    lineId ? [factoryId, reportingPeriodId, lineId] : [factoryId, reportingPeriodId],
  );

  const benchmark = enrichBenchmarkRows(benchRaw);

  const { rows: belowTarget } = await pool.query<BelowTargetRow>(
    `SELECT g.line_id::text,
            g.line_code,
            g.kpi_code,
            g.kpi_name,
            g.definition_unit,
            g.current_value,
            g.target_value,
            g.gap_to_target_signed
     FROM vw_kpi_below_factory_target g
     WHERE g.factory_id = $1::uuid
       AND g.reporting_period_id = $2::uuid
       ${lineId ? "AND g.line_id = $3::uuid" : ""}`,
    lineId ? [factoryId, reportingPeriodId, lineId] : [factoryId, reportingPeriodId],
  );

  const { rows: validationErrors } = await pool.query<ValidationRow>(
    `SELECT pl.id::text AS line_id,
            pl.line_code,
            d.issue_code,
            d.issue_message,
            d.issue_severity
     FROM data_validation_issues d
     INNER JOIN production_fact_monthly pf ON pf.id = d.production_fact_id
     INNER JOIN production_lines pl ON pl.id = pf.line_id AND pl.factory_id = $1::uuid
     WHERE pf.reporting_period_id = $2::uuid
       AND d.issue_severity = 'error'
       ${lineId ? "AND pf.line_id = $3::uuid" : ""}
     ORDER BY d.created_at DESC
     LIMIT 50`,
    lineId ? [factoryId, reportingPeriodId, lineId] : [factoryId, reportingPeriodId],
  );

  const { rows: validationWarnings } = await pool.query<ValidationRow>(
    `SELECT pl.id::text AS line_id,
            pl.line_code,
            d.issue_code,
            d.issue_message,
            d.issue_severity
     FROM data_validation_issues d
     INNER JOIN production_fact_monthly pf ON pf.id = d.production_fact_id
     INNER JOIN production_lines pl ON pl.id = pf.line_id AND pl.factory_id = $1::uuid
     WHERE pf.reporting_period_id = $2::uuid
       AND d.issue_severity = 'warning'
       ${lineId ? "AND pf.line_id = $3::uuid" : ""}
     ORDER BY d.created_at DESC
     LIMIT 30`,
    lineId ? [factoryId, reportingPeriodId, lineId] : [factoryId, reportingPeriodId],
  );

  return {
    benchmark,
    belowTarget,
    validationErrors,
    validationWarnings,
  };
}
