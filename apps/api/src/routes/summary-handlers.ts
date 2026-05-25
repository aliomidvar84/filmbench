import type { IncomingMessage, ServerResponse } from "node:http";

import { getPool, requirePool } from "../db.js";
import { sendJson } from "../http/respond.js";
import { isUuid, requestUrl } from "../http/util.js";
import { requireAccessFromRequest } from "./auth-handlers.js";
import { assertDashboard } from "./dashboard-handlers.js";

const PRIORITY_LIMIT = 20;

export async function handleFactorySummary(
  req: IncomingMessage,
  res: ServerResponse,
  factoryId: string,
): Promise<void> {
  if (!getPool()) {
    sendJson(res, 503, { error: "database_unconfigured" });
    return;
  }
  let claims;
  try {
    claims = requireAccessFromRequest(req);
  } catch {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }
  if (!assertDashboard(res, claims.memberships, factoryId)) return;

  const url = requestUrl(req);
  const periodId = url.searchParams.get("reporting_period_id")?.trim() ?? "";
  const lineIdRaw = url.searchParams.get("line_id")?.trim() ?? "";
  if (!isUuid(periodId)) {
    sendJson(res, 400, { error: "reporting_period_id_required" });
    return;
  }
  if (lineIdRaw && !isUuid(lineIdRaw)) {
    sendJson(res, 400, { error: "invalid_line_id" });
    return;
  }

  const pool = requirePool();
  const params = [factoryId, periodId, lineIdRaw || null];

  const countsRes = await pool.query<{
    lines: number;
    kpi_results: number;
    validation_errors: number;
    validation_warnings: number;
    below_target: number;
    below_peer_median: number;
    insufficient_peer_sample: number;
    targets_defined: number;
  }>(
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

  const { rows: validationPriority } = await pool.query(
    `SELECT 'validation_error' AS kind,
            pl.line_code,
            d.issue_code AS ref_code,
            d.issue_message AS message,
            d.issue_severity AS severity,
            NULL::text AS metric_value
     FROM data_validation_issues d
     INNER JOIN production_fact_monthly pf ON pf.id = d.production_fact_id
     INNER JOIN production_lines pl ON pl.id = pf.line_id AND pl.factory_id = $1::uuid
     WHERE pf.reporting_period_id = $2::uuid
       AND ($3::uuid IS NULL OR pf.line_id = $3::uuid)
       AND d.issue_severity = 'error'
     ORDER BY d.created_at DESC
     LIMIT 8`,
    params,
  );

  const { rows: targetPriority } = await pool.query(
    `SELECT 'below_target' AS kind,
            g.line_code,
            g.kpi_code AS ref_code,
            'Below factory KPI target' AS message,
            'high' AS severity,
            g.gap_to_target_signed AS metric_value
     FROM vw_kpi_below_factory_target g
     WHERE g.factory_id = $1::uuid
       AND g.reporting_period_id = $2::uuid
       AND ($3::uuid IS NULL OR g.line_id = $3::uuid)
     ORDER BY abs(g.gap_to_target_signed::numeric) DESC NULLS LAST
     LIMIT 8`,
    params,
  );

  const { rows: peerPriority } = await pool.query(
    `SELECT 'below_peer_median' AS kind,
            pl.line_code,
            v.kpi_code AS ref_code,
            'Below peer median (cohort)' AS message,
            'medium' AS severity,
            v.gap_to_median_signed::text AS metric_value
     FROM vw_kpi_benchmark_comparison v
     INNER JOIN production_lines pl ON pl.id = v.line_id
     WHERE v.factory_id = $1::uuid
       AND v.reporting_period_id = $2::uuid
       AND ($3::uuid IS NULL OR v.line_id = $3::uuid)
       AND v.comparison_status = 'ok'
       AND v.gap_to_median_signed IS NOT NULL
       AND v.gap_to_median_signed < 0
     ORDER BY v.gap_to_median_signed ASC
     LIMIT 8`,
    params,
  );

  const { rows: warningPriority } = await pool.query(
    `SELECT 'validation_warning' AS kind,
            pl.line_code,
            d.issue_code AS ref_code,
            d.issue_message AS message,
            d.issue_severity AS severity,
            NULL::text AS metric_value
     FROM data_validation_issues d
     INNER JOIN production_fact_monthly pf ON pf.id = d.production_fact_id
     INNER JOIN production_lines pl ON pl.id = pf.line_id AND pl.factory_id = $1::uuid
     WHERE pf.reporting_period_id = $2::uuid
       AND ($3::uuid IS NULL OR pf.line_id = $3::uuid)
       AND d.issue_severity = 'warning'
     ORDER BY d.created_at DESC
     LIMIT 4`,
    params,
  );

  const priorities = [
    ...validationPriority,
    ...targetPriority,
    ...peerPriority,
    ...warningPriority,
  ].slice(0, PRIORITY_LIMIT);

  const { rows: recentBatches } = await pool.query(
    `SELECT ib.id::text AS id,
            ib.original_filename,
            ib.status,
            ib.row_count,
            ib.created_at::text AS created_at,
            u.email AS uploaded_by_email
     FROM ingestion_batches ib
     INNER JOIN users u ON u.id = ib.uploaded_by_user_id
     WHERE ib.factory_id = $1::uuid
     ORDER BY ib.created_at DESC
     LIMIT 5`,
    [factoryId],
  );

  sendJson(res, 200, {
    factory_id: factoryId,
    reporting_period_id: periodId,
    line_id: lineIdRaw || null,
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
    recent_ingestion_batches: recentBatches,
  });
}
