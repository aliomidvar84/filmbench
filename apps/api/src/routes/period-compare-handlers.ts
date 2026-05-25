import type { IncomingMessage, ServerResponse } from "node:http";

import { getPool, requirePool } from "../db.js";
import { toCsv } from "../http/csv.js";
import { sendJson, sendText } from "../http/respond.js";
import { isUuid, requestUrl } from "../http/util.js";
import {
  deltaAbsolute,
  deltaPercent,
  parseNumeric,
  periodTrendLabel,
} from "../trends/period-delta.js";
import { requireAccessFromRequest } from "./auth-handlers.js";
import { assertDashboard } from "./dashboard-handlers.js";

interface PeriodRow {
  id: string;
  period_end: string;
  label: string | null;
}

interface CompareRawRow {
  kpi_code: string;
  kpi_name: string;
  definition_unit: string;
  direction: "higher" | "lower";
  current_value: string | null;
  prior_value: string | null;
}

function enrichRow(row: CompareRawRow) {
  const cur = parseNumeric(row.current_value);
  const pri = parseNumeric(row.prior_value);
  const dAbs = deltaAbsolute(cur, pri);
  const dPct = deltaPercent(cur, pri);
  return {
    kpi_code: row.kpi_code,
    kpi_name: row.kpi_name,
    definition_unit: row.definition_unit,
    direction: row.direction,
    current_value: row.current_value,
    prior_value: row.prior_value,
    delta_absolute: dAbs == null ? null : String(dAbs),
    delta_percent: dPct == null ? null : String(dPct),
    trend: periodTrendLabel(row.direction, cur, pri),
  };
}

async function resolvePriorPeriodId(
  pool: ReturnType<typeof requirePool>,
  factoryId: string,
  lineId: string,
  currentPeriodId: string,
  explicitPrior: string | null,
): Promise<{ priorId: string | null; autoSelected: boolean }> {
  if (explicitPrior) {
    const ok = await pool.query(
      `SELECT 1 FROM reporting_periods rp
       INNER JOIN kpi_results kr ON kr.reporting_period_id = rp.id
       WHERE rp.id = $1::uuid AND kr.factory_id = $2::uuid AND kr.line_id = $3::uuid`,
      [explicitPrior, factoryId, lineId],
    );
    return ok.rowCount ? { priorId: explicitPrior, autoSelected: false } : { priorId: null, autoSelected: false };
  }

  const { rows } = await pool.query<{ id: string }>(
    `SELECT rp.id::text AS id
     FROM reporting_periods rp
     INNER JOIN kpi_results kr ON kr.reporting_period_id = rp.id
     WHERE kr.factory_id = $1::uuid
       AND kr.line_id = $2::uuid
       AND rp.period_type = 'monthly'
       AND rp.period_end < (
         SELECT period_end FROM reporting_periods WHERE id = $3::uuid
       )
     GROUP BY rp.id, rp.period_end
     ORDER BY rp.period_end DESC
     LIMIT 1`,
    [factoryId, lineId, currentPeriodId],
  );
  return {
    priorId: rows[0]?.id ?? null,
    autoSelected: true,
  };
}

async function loadPeriodMeta(
  pool: ReturnType<typeof requirePool>,
  periodId: string,
): Promise<PeriodRow | null> {
  const { rows } = await pool.query<PeriodRow>(
    `SELECT id::text AS id,
            period_end::text AS period_end,
            label
     FROM reporting_periods
     WHERE id = $1::uuid`,
    [periodId],
  );
  return rows[0] ?? null;
}

async function fetchComparisonRows(
  pool: ReturnType<typeof requirePool>,
  factoryId: string,
  lineId: string,
  currentPeriodId: string,
  priorPeriodId: string | null,
): Promise<CompareRawRow[]> {
  const { rows } = await pool.query<CompareRawRow>(
    `SELECT kd.kpi_code,
            kd.name AS kpi_name,
            kd.unit AS definition_unit,
            kd.direction,
            cur.kpi_value::text AS current_value,
            pri.kpi_value::text AS prior_value
     FROM kpi_results cur
     INNER JOIN kpi_definitions kd ON kd.kpi_code = cur.kpi_code
     LEFT JOIN kpi_results pri
       ON pri.line_id = cur.line_id
      AND pri.kpi_code = cur.kpi_code
      AND pri.reporting_period_id = $4::uuid
     WHERE cur.factory_id = $1::uuid
       AND cur.line_id = $2::uuid
       AND cur.reporting_period_id = $3::uuid
       AND cur.calculation_status = 'ok'
     ORDER BY kd.tier, kd.kpi_code`,
    [factoryId, lineId, currentPeriodId, priorPeriodId],
  );
  return rows;
}

export async function handleFactoryKpiPeriodComparison(
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
  const currentPeriodId = url.searchParams.get("current_period_id")?.trim() ?? "";
  const priorPeriodIdRaw = url.searchParams.get("prior_period_id")?.trim() ?? "";

  if (!isUuid(lineId)) {
    sendJson(res, 400, { error: "line_id_required" });
    return;
  }
  if (!isUuid(currentPeriodId)) {
    sendJson(res, 400, { error: "current_period_id_required" });
    return;
  }
  if (priorPeriodIdRaw && !isUuid(priorPeriodIdRaw)) {
    sendJson(res, 400, { error: "invalid_prior_period_id" });
    return;
  }

  const pool = requirePool();
  const lineOk = await pool.query(
    `SELECT pl.line_code FROM production_lines pl
     WHERE pl.id = $1::uuid AND pl.factory_id = $2::uuid`,
    [lineId, factoryId],
  );
  if (!lineOk.rowCount) {
    sendJson(res, 404, { error: "line_not_found" });
    return;
  }
  const lineCode = (lineOk.rows[0] as { line_code: string }).line_code;

  const { priorId, autoSelected } = await resolvePriorPeriodId(
    pool,
    factoryId,
    lineId,
    currentPeriodId,
    priorPeriodIdRaw || null,
  );

  const currentMeta = await loadPeriodMeta(pool, currentPeriodId);
  const priorMeta = priorId ? await loadPeriodMeta(pool, priorId) : null;

  const raw = await fetchComparisonRows(
    pool,
    factoryId,
    lineId,
    currentPeriodId,
    priorId,
  );
  const rows = raw.map(enrichRow);

  sendJson(res, 200, {
    factory_id: factoryId,
    line_id: lineId,
    line_code: lineCode,
    current_period: currentMeta,
    prior_period: priorMeta,
    prior_period_auto_selected: autoSelected,
    rows,
  });
}

export async function handleExportKpiPeriodComparisonCsv(
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
  const currentPeriodId = url.searchParams.get("current_period_id")?.trim() ?? "";
  const priorPeriodIdRaw = url.searchParams.get("prior_period_id")?.trim() ?? "";

  if (!isUuid(lineId) || !isUuid(currentPeriodId)) {
    sendJson(res, 400, { error: "line_id_and_current_period_id_required" });
    return;
  }

  const pool = requirePool();
  const { priorId } = await resolvePriorPeriodId(
    pool,
    factoryId,
    lineId,
    currentPeriodId,
    priorPeriodIdRaw || null,
  );

  const raw = await fetchComparisonRows(
    pool,
    factoryId,
    lineId,
    currentPeriodId,
    priorId,
  );
  const rows = raw.map(enrichRow);
  const keys =
    rows.length > 0
      ? Object.keys(rows[0]!)
      : [
          "kpi_code",
          "kpi_name",
          "definition_unit",
          "direction",
          "current_value",
          "prior_value",
          "delta_absolute",
          "delta_percent",
          "trend",
        ];
  const data = rows.map((r) =>
    keys.map((k) => {
      const v = (r as Record<string, unknown>)[k];
      return v == null ? "" : String(v);
    }),
  );
  const csv = toCsv(keys, data);
  sendText(res, 200, `\ufeff${csv}`, "text/csv", {
    "content-disposition": `attachment; filename="filmbench-period-compare-${lineId.slice(0, 8)}.csv"`,
  });
}
