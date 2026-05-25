import type { IncomingMessage, ServerResponse } from "node:http";

import {
  type FactoryRole,
  type Membership,
  canViewDashboardAndReports,
  roleForFactory,
} from "../auth/rbac.js";
import { getPool, requirePool } from "../db.js";
import { sendJson } from "../http/respond.js";
import { isUuid, requestUrl } from "../http/util.js";
import { fetchKpiTrendRows } from "@filmbench/analytics";

import { groupKpiTrendRows } from "../trends/group.js";
import { requireAccessFromRequest } from "./auth-handlers.js";

export function assertFactoryMember(
  res: ServerResponse,
  memberships: Membership[],
  factoryId: string,
): FactoryRole | null {
  if (!isUuid(factoryId)) {
    sendJson(res, 400, { error: "invalid_factory_id" });
    return null;
  }
  const role = roleForFactory(memberships, factoryId);
  if (!role) {
    sendJson(res, 403, { error: "forbidden" });
    return null;
  }
  return role;
}

export function assertDashboard(
  res: ServerResponse,
  memberships: Membership[],
  factoryId: string,
): FactoryRole | null {
  const role = assertFactoryMember(res, memberships, factoryId);
  if (!role) return null;
  if (!canViewDashboardAndReports(role)) {
    sendJson(res, 403, { error: "forbidden" });
    return null;
  }
  return role;
}

export async function handleFactoryLines(
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
  if (!assertFactoryMember(res, claims.memberships, factoryId)) return;

  const pool = requirePool();
  const { rows } = await pool.query<{
    id: string;
    line_code: string;
    line_type: string;
    width_mm: string | null;
  }>(
    `SELECT pl.id::text,
            pl.line_code,
            pl.line_type,
            pl.width_mm::text AS width_mm
     FROM production_lines pl
     WHERE pl.factory_id = $1::uuid
     ORDER BY pl.line_code`,
    [factoryId],
  );
  sendJson(res, 200, { lines: rows });
}

export async function handleFactoryReportingPeriods(
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
  if (!assertFactoryMember(res, claims.memberships, factoryId)) return;

  const pool = requirePool();
  const { rows } = await pool.query<{
    id: string;
    period_start: string;
    period_end: string;
    label: string | null;
  }>(
    `SELECT DISTINCT rp.id::text,
            rp.period_start::text AS period_start,
            rp.period_end::text AS period_end,
            rp.label
     FROM reporting_periods rp
     WHERE rp.id IN (
       SELECT pf.reporting_period_id
       FROM production_fact_monthly pf
       INNER JOIN production_lines pl ON pl.id = pf.line_id AND pl.factory_id = $1::uuid
       UNION
       SELECT kr.reporting_period_id
       FROM kpi_results kr
       WHERE kr.factory_id = $1::uuid
     )
     ORDER BY period_end DESC, period_start DESC`,
    [factoryId],
  );
  sendJson(res, 200, { reporting_periods: rows });
}

export async function handleFactoryKpiResults(
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
  sendJson(res, 200, { kpi_results: rows });
}

export async function handleFactoryKpiTrends(
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

  const { rows, source } = await fetchKpiTrendRows(pool, {
    factoryId,
    lineId,
    maxPeriods,
    kpiCodes: codesFilter,
  });

  const series = groupKpiTrendRows(rows);
  sendJson(res, 200, {
    factory_id: factoryId,
    line_id: lineId,
    max_periods: maxPeriods,
    series,
    query_source: source,
  });
}
