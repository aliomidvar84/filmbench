import type { IncomingMessage, ServerResponse } from "node:http";

import {
  buildBenchmarkQuery,
  enrichBenchmarkRows,
  parseBenchmarkFilters,
  type BenchmarkRowRaw,
} from "../benchmark/comparison.js";
import { getPool, requirePool } from "../db.js";
import { toCsv } from "../http/csv.js";
import { sendJson, sendText } from "../http/respond.js";
import { isUuid, requestUrl } from "../http/util.js";
import {
  groupKpiTrendRows,
  trendPeriodColumns,
  trendPointValue,
  type RawTrendRow,
} from "../trends/group.js";
import { requireAccessFromRequest } from "./auth-handlers.js";
import { assertDashboard } from "./dashboard-handlers.js";

const BENCHMARK_CSV_HEADERS = [
  "kpi_result_id",
  "line_id",
  "line_code",
  "reporting_period_id",
  "kpi_code",
  "direction",
  "current_value",
  "definition_unit",
  "cohort_key",
  "stored_cohort_key",
  "peer_sample_size",
  "peer_min",
  "peer_max",
  "peer_avg",
  "peer_stddev",
  "peer_p10",
  "peer_p25",
  "peer_p50",
  "peer_p75",
  "peer_p90",
  "best_practice_peer_value",
  "gap_to_median_signed",
  "gap_to_best_practice_signed",
  "comparison_status",
] as const;

function rowString(record: Record<string, unknown>, keys: string[]): string[] {
  return keys.map((k) => {
    const v = record[k];
    if (v == null) return "";
    return String(v);
  });
}

export async function handleExportKpiResultsCsv(
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
  const { rows } = await pool.query(
    `SELECT kr.id::text AS id,
            kr.line_id::text AS line_id,
            pl.line_code,
            kr.reporting_period_id::text AS reporting_period_id,
            kr.kpi_code,
            kd.name AS kpi_name,
            kd.category,
            kd.unit AS definition_unit,
            kd.direction,
            kr.kpi_value::text AS kpi_value,
            kr.kpi_unit,
            kr.benchmark_cohort_key,
            kr.calculation_status,
            kr.calculated_at::text AS calculated_at
     FROM kpi_results kr
     INNER JOIN kpi_definitions kd ON kd.kpi_code = kr.kpi_code
     INNER JOIN production_lines pl ON pl.id = kr.line_id
     WHERE kr.factory_id = $1::uuid
       AND kr.reporting_period_id = $2::uuid
       AND ($3::uuid IS NULL OR kr.line_id = $3::uuid)
     ORDER BY pl.line_code, kd.tier, kr.kpi_code`,
    [factoryId, periodId, lineIdRaw || null],
  );

  const recs = rows as Record<string, unknown>[];
  const keys =
    recs.length > 0
      ? Object.keys(recs[0]!)
      : [
          "id",
          "line_id",
          "line_code",
          "reporting_period_id",
          "kpi_code",
          "kpi_name",
          "category",
          "definition_unit",
          "direction",
          "kpi_value",
          "kpi_unit",
          "benchmark_cohort_key",
          "calculation_status",
          "calculated_at",
        ];
  const data = recs.map((r) => rowString(r, keys));
  const csv = toCsv(keys, data);
  sendText(res, 200, `\ufeff${csv}`, "text/csv", {
    "content-disposition": `attachment; filename="filmbench-kpi-results-${periodId.slice(0, 8)}.csv"`,
  });
}

export async function handleExportBenchmarkCsv(
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
  const lineIdRaw = url.searchParams.get("line_id")?.trim() ?? "";
  if (lineIdRaw && !isUuid(lineIdRaw)) {
    sendJson(res, 400, { error: "invalid_line_id" });
    return;
  }
  const parsed = parseBenchmarkFilters(url);
  if (!parsed.filters) {
    sendJson(res, 400, { error: parsed.error ?? "invalid_filters" });
    return;
  }
  if (lineIdRaw) parsed.filters.lineId = lineIdRaw;

  const pool = requirePool();
  const { sql, params } = buildBenchmarkQuery(factoryId, parsed.filters);
  const { rows } = await pool.query<BenchmarkRowRaw>(sql, params);
  const enriched = enrichBenchmarkRows(rows);

  const recs = enriched as unknown as Record<string, unknown>[];
  const keys = recs.length > 0 ? Object.keys(recs[0]!) : [...BENCHMARK_CSV_HEADERS];
  const data = recs.map((r) => rowString(r, keys));
  const csv = toCsv(keys, data);
  sendText(res, 200, `\ufeff${csv}`, "text/csv", {
    "content-disposition": `attachment; filename="filmbench-benchmark-${parsed.filters.reportingPeriodId.slice(0, 8)}.csv"`,
  });
}

export async function handleExportKpiTrendsCsv(
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
  const lineId = url.searchParams.get("line_id")?.trim() ?? "";
  if (!isUuid(lineId)) {
    sendJson(res, 400, { error: "line_id_required" });
    return;
  }

  const rawMax = Number(url.searchParams.get("max_periods") ?? "36");
  const maxPeriods = Number.isFinite(rawMax)
    ? Math.min(120, Math.max(1, Math.floor(rawMax)))
    : 36;

  const codesRaw = url.searchParams.get("kpi_codes")?.trim() ?? "";
  const kpiCodes = codesRaw
    ? codesRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const codesFilter: string[] = kpiCodes;

  const pool = requirePool();
  const lineOk = await pool.query(
    `SELECT 1 FROM production_lines
     WHERE id = $1::uuid AND factory_id = $2::uuid`,
    [lineId, factoryId],
  );
  if (!lineOk.rowCount) {
    sendJson(res, 404, { error: "line_not_found" });
    return;
  }

  const { rows } = await pool.query(
    `WITH recent_periods AS (
       SELECT rp.id
       FROM reporting_periods rp
       INNER JOIN kpi_results kr ON kr.reporting_period_id = rp.id
       WHERE kr.factory_id = $1::uuid
         AND kr.line_id = $2::uuid
         AND rp.period_type = 'monthly'
       GROUP BY rp.id, rp.period_end
       ORDER BY rp.period_end DESC
       LIMIT $3
     )
     SELECT kr.kpi_code,
            kd.name AS kpi_name,
            kd.unit AS definition_unit,
            rp.id::text AS reporting_period_id,
            rp.period_start::text AS period_start,
            rp.period_end::text AS period_end,
            rp.label,
            kr.kpi_value::text AS kpi_value,
            kr.calculation_status
     FROM kpi_results kr
     INNER JOIN recent_periods p ON p.id = kr.reporting_period_id
     INNER JOIN reporting_periods rp ON rp.id = kr.reporting_period_id
     INNER JOIN kpi_definitions kd ON kd.kpi_code = kr.kpi_code
     WHERE kr.factory_id = $1::uuid
       AND kr.line_id = $2::uuid
       AND (cardinality($4::text[]) = 0 OR kr.kpi_code = ANY ($4::text[]))
     ORDER BY rp.period_end ASC, kr.kpi_code`,
    [factoryId, lineId, maxPeriods, codesFilter],
  );

  const series = groupKpiTrendRows(rows as RawTrendRow[]);
  const cols = trendPeriodColumns(series);
  const headers = [
    "kpi_code",
    "kpi_name",
    "definition_unit",
    ...cols.map((c) => `value_${c.period_end}`),
  ];
  const dataRows = series.map((s) => [
    s.kpi_code,
    s.kpi_name,
    s.definition_unit,
    ...cols.map((c) => trendPointValue(s, c.id)),
  ]);
  const csv = toCsv(headers, dataRows);
  sendText(res, 200, `\ufeff${csv}`, "text/csv", {
    "content-disposition": `attachment; filename="filmbench-kpi-trends-${lineId.slice(0, 8)}.csv"`,
  });
}

export async function handleFactoryAuditEvents(
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

  const pool = requirePool();
  const { rows } = await pool.query(
    `SELECT ae.id::text AS id,
            ae.action,
            ae.entity_type,
            ae.entity_id,
            ae.metadata,
            ae.created_at::text AS created_at,
            u.email AS actor_email
     FROM audit_events ae
     LEFT JOIN users u ON u.id = ae.actor_user_id
     WHERE ae.factory_id = $1::uuid
     ORDER BY ae.created_at DESC
     LIMIT 200`,
    [factoryId],
  );
  sendJson(res, 200, { audit_events: rows });
}
