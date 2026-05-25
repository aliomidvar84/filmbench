import type { Pool } from "pg";

export interface ExecutiveCounts {
  lines: number;
  kpi_results: number;
  validation_errors: number;
  validation_warnings: number;
  below_target: number;
  below_peer_median: number;
  insufficient_peer_sample: number;
  targets_defined: number;
}

export interface ExecutiveReportContext {
  factory_name: string;
  period_label: string | null;
  period_end: string;
  line_code: string | null;
  generated_at_iso: string;
  counts: ExecutiveCounts;
  priorities: Record<string, unknown>[];
  below_target: Record<string, unknown>[];
  benchmark_gaps: Record<string, unknown>[];
}

export async function loadExecutiveReportContext(
  pool: Pool,
  factoryId: string,
  periodId: string,
  lineId: string | null,
): Promise<ExecutiveReportContext | null> {
  const factoryRes = await pool.query<{ factory_name: string }>(
    `SELECT factory_name FROM factories WHERE id = $1::uuid`,
    [factoryId],
  );
  const factory = factoryRes.rows[0];
  if (!factory) return null;

  const periodRes = await pool.query<{
    label: string | null;
    period_end: string;
  }>(
    `SELECT label, period_end::text AS period_end
     FROM reporting_periods WHERE id = $1::uuid`,
    [periodId],
  );
  const period = periodRes.rows[0];
  if (!period) return null;

  let lineCode: string | null = null;
  if (lineId) {
    const lineRes = await pool.query<{ line_code: string }>(
      `SELECT line_code FROM production_lines
       WHERE id = $1::uuid AND factory_id = $2::uuid`,
      [lineId, factoryId],
    );
    if (!lineRes.rowCount) return null;
    lineCode = lineRes.rows[0]?.line_code ?? null;
  }

  const params = [factoryId, periodId, lineId];

  const countsRes = await pool.query<ExecutiveCounts>(
    `SELECT
       (SELECT count(*)::int FROM production_lines pl WHERE pl.factory_id = $1::uuid) AS lines,
       (SELECT count(*)::int
        FROM kpi_results kr
        WHERE kr.factory_id = $1::uuid
          AND kr.reporting_period_id = $2::uuid
          AND ($3::uuid IS NULL OR kr.line_id = $3::uuid)) AS kpi_results,
       (SELECT count(*)::int
        FROM data_validation_issues d
        INNER JOIN production_fact_monthly pf ON pf.id = d.production_fact_id
        INNER JOIN production_lines pl ON pl.id = pf.line_id AND pl.factory_id = $1::uuid
        WHERE pf.reporting_period_id = $2::uuid
          AND ($3::uuid IS NULL OR pf.line_id = $3::uuid)
          AND d.issue_severity = 'error') AS validation_errors,
       (SELECT count(*)::int
        FROM data_validation_issues d
        INNER JOIN production_fact_monthly pf ON pf.id = d.production_fact_id
        INNER JOIN production_lines pl ON pl.id = pf.line_id AND pl.factory_id = $1::uuid
        WHERE pf.reporting_period_id = $2::uuid
          AND ($3::uuid IS NULL OR pf.line_id = $3::uuid)
          AND d.issue_severity = 'warning') AS validation_warnings,
       (SELECT count(*)::int
        FROM vw_kpi_below_factory_target g
        WHERE g.factory_id = $1::uuid
          AND g.reporting_period_id = $2::uuid
          AND ($3::uuid IS NULL OR g.line_id = $3::uuid)) AS below_target,
       (SELECT count(*)::int
        FROM vw_kpi_benchmark_comparison v
        WHERE v.factory_id = $1::uuid
          AND v.reporting_period_id = $2::uuid
          AND ($3::uuid IS NULL OR v.line_id = $3::uuid)
          AND v.comparison_status = 'ok'
          AND v.gap_to_median_signed IS NOT NULL
          AND v.gap_to_median_signed < 0) AS below_peer_median,
       (SELECT count(*)::int
        FROM vw_kpi_benchmark_comparison v
        WHERE v.factory_id = $1::uuid
          AND v.reporting_period_id = $2::uuid
          AND ($3::uuid IS NULL OR v.line_id = $3::uuid)
          AND v.comparison_status = 'insufficient_peer_sample') AS insufficient_peer_sample,
       (SELECT count(*)::int
        FROM factory_kpi_targets t
        WHERE t.factory_id = $1::uuid) AS targets_defined`,
    params,
  );

  const { rows: priorities } = await pool.query(
    `SELECT * FROM (
       SELECT 'validation_error' AS kind,
              pl.line_code,
              d.issue_code AS ref_code,
              d.issue_message AS message,
              d.issue_severity AS severity,
              NULL::text AS metric_value,
              1 AS sort_rank
       FROM data_validation_issues d
       INNER JOIN production_fact_monthly pf ON pf.id = d.production_fact_id
       INNER JOIN production_lines pl ON pl.id = pf.line_id AND pl.factory_id = $1::uuid
       WHERE pf.reporting_period_id = $2::uuid
         AND ($3::uuid IS NULL OR pf.line_id = $3::uuid)
         AND d.issue_severity = 'error'
       UNION ALL
       SELECT 'below_target',
              g.line_code,
              g.kpi_code,
              'Below factory KPI target',
              'high',
              g.gap_to_target_signed::text,
              2
       FROM vw_kpi_below_factory_target g
       WHERE g.factory_id = $1::uuid
         AND g.reporting_period_id = $2::uuid
         AND ($3::uuid IS NULL OR g.line_id = $3::uuid)
       UNION ALL
       SELECT 'below_peer_median',
              pl.line_code,
              v.kpi_code,
              'Below peer median',
              'medium',
              v.gap_to_median_signed::text,
              3
       FROM vw_kpi_benchmark_comparison v
       INNER JOIN production_lines pl ON pl.id = v.line_id
       WHERE v.factory_id = $1::uuid
         AND v.reporting_period_id = $2::uuid
         AND ($3::uuid IS NULL OR v.line_id = $3::uuid)
         AND v.comparison_status = 'ok'
         AND v.gap_to_median_signed IS NOT NULL
         AND v.gap_to_median_signed < 0
     ) x
     ORDER BY sort_rank, line_code, ref_code
     LIMIT 50`,
    params,
  );

  const { rows: belowTarget } = await pool.query(
    `SELECT g.line_code,
            g.kpi_code,
            g.kpi_name,
            g.definition_unit,
            g.direction,
            g.current_value,
            g.target_value,
            g.gap_to_target_signed
     FROM vw_kpi_below_factory_target g
     WHERE g.factory_id = $1::uuid
       AND g.reporting_period_id = $2::uuid
       AND ($3::uuid IS NULL OR g.line_id = $3::uuid)
     ORDER BY abs(g.gap_to_target_signed::numeric) DESC NULLS LAST
     LIMIT 100`,
    params,
  );

  const { rows: benchmarkGaps } = await pool.query(
    `SELECT pl.line_code,
            v.kpi_code,
            kd.name AS kpi_name,
            v.current_value::text AS current_value,
            v.peer_p50::text AS peer_p50,
            v.gap_to_median_signed::text AS gap_to_median_signed,
            v.gap_to_best_practice_signed::text AS gap_to_best_practice_signed,
            v.comparison_status
     FROM vw_kpi_benchmark_comparison v
     INNER JOIN production_lines pl ON pl.id = v.line_id
     INNER JOIN kpi_definitions kd ON kd.kpi_code = v.kpi_code
     WHERE v.factory_id = $1::uuid
       AND v.reporting_period_id = $2::uuid
       AND ($3::uuid IS NULL OR v.line_id = $3::uuid)
       AND v.comparison_status = 'ok'
       AND v.gap_to_median_signed IS NOT NULL
       AND v.gap_to_median_signed < 0
     ORDER BY v.gap_to_median_signed ASC
     LIMIT 100`,
    params,
  );

  return {
    factory_name: factory.factory_name,
    period_label: period.label,
    period_end: period.period_end,
    line_code: lineCode,
    generated_at_iso: new Date().toISOString(),
    counts: countsRes.rows[0] ?? {
      lines: 0,
      kpi_results: 0,
      validation_errors: 0,
      validation_warnings: 0,
      below_target: 0,
      below_peer_median: 0,
      insufficient_peer_sample: 0,
      targets_defined: 0,
    },
    priorities,
    below_target: belowTarget,
    benchmark_gaps: benchmarkGaps,
  };
}
