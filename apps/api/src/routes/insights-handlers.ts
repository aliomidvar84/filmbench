import type { IncomingMessage, ServerResponse } from "node:http";

import { insertAuditEvent } from "../audit/log.js";
import {
  evaluateInsightRules,
  persistInsights,
} from "../insights/evaluate.js";
import { calculateImpact } from "../insights/impact.js";
import {
  loadImpactParams,
  mergeImpactParams,
} from "../insights/impact-params.js";
import { notifyFactoryMembers } from "../notifications/insert.js";
import { getPool, requirePool } from "../db.js";
import { sendJson } from "../http/respond.js";
import { isUuid, readJsonBody, requestUrl } from "../http/util.js";
import { requireAccessFromRequest } from "./auth-handlers.js";
import { assertDashboard } from "./dashboard-handlers.js";

const MAX_LIST = 100;

interface RefreshBody {
  reporting_period_id?: string;
  line_id?: string | null;
}

export async function handleFactoryInsights(
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
  const severity = url.searchParams.get("severity")?.trim() ?? "";

  if (!isUuid(periodId)) {
    sendJson(res, 400, { error: "reporting_period_id_required" });
    return;
  }
  const lineId = lineIdRaw && isUuid(lineIdRaw) ? lineIdRaw : null;
  if (lineIdRaw && !lineId) {
    sendJson(res, 400, { error: "invalid_line_id" });
    return;
  }

  const pool = requirePool();
  const params: unknown[] = [factoryId, periodId];
  let filter = `WHERE gi.factory_id = $1::uuid AND gi.reporting_period_id = $2::uuid`;
  if (lineId) {
    params.push(lineId);
    filter += ` AND gi.line_id = $${params.length}::uuid`;
  }
  if (severity && ["info", "warning", "critical"].includes(severity)) {
    params.push(severity);
    filter += ` AND gi.severity = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT gi.id::text,
            gi.line_id::text,
            pl.line_code,
            gi.reporting_period_id::text,
            gi.rule_code,
            gi.severity,
            gi.priority_score::text AS priority_score,
            gi.title,
            gi.body,
            gi.kpi_code,
            gi.impact_estimate,
            gi.metadata,
            gi.created_at::text AS created_at
     FROM generated_insights gi
     LEFT JOIN production_lines pl ON pl.id = gi.line_id
     ${filter}
     ORDER BY gi.priority_score DESC, gi.created_at DESC
     LIMIT ${MAX_LIST}`,
    params,
  );

  sendJson(res, 200, { insights: rows, count: rows.length });
}

export async function handleRefreshFactoryInsights(
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

  let body: RefreshBody = {};
  try {
    body = (await readJsonBody(req)) as RefreshBody;
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return;
  }

  const periodId = body.reporting_period_id?.trim() ?? "";
  const lineIdRaw =
    body.line_id === null || body.line_id === undefined
      ? ""
      : String(body.line_id).trim();

  if (!isUuid(periodId)) {
    sendJson(res, 400, { error: "reporting_period_id_required" });
    return;
  }
  const lineId = lineIdRaw && isUuid(lineIdRaw) ? lineIdRaw : null;
  if (lineIdRaw && !lineId) {
    sendJson(res, 400, { error: "invalid_line_id" });
    return;
  }

  const pool = requirePool();
  const { insights, executionCounts } = await evaluateInsightRules(
    pool,
    factoryId,
    periodId,
    lineId,
  );
  const { inserted, critical_count } = await persistInsights(
    pool,
    factoryId,
    periodId,
    lineId,
    insights,
    executionCounts,
  );

  void insertAuditEvent(pool, {
    factoryId,
    actorUserId: claims.sub,
    action: "insights.refreshed",
    entityType: "generated_insights",
    entityId: periodId,
    metadata: { inserted, critical_count, line_id: lineId },
  }).catch(() => {});

  if (critical_count > 0) {
    void notifyFactoryMembers(pool, factoryId, {
      kind: "insight_alert",
      severity: "critical",
      title: `${critical_count} critical insight(s) need attention`,
      body: `Insight refresh found ${inserted} total opportunities for this period.`,
      href: "/insights",
      metadata: { critical_count, inserted, reporting_period_id: periodId },
    }).catch(() => {});
  }

  sendJson(res, 200, {
    ok: true,
    inserted,
    critical_count,
    rules_evaluated: Object.keys(executionCounts).length,
  });
}

interface ImpactCalculatorBody {
  kpi_code?: string;
  gap_signed?: number;
  unit?: string;
  monthly_output_kg?: number;
  margin_per_kg?: number;
  energy_cost_per_kwh?: number;
}

export async function handleImpactCalculator(
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

  let body: ImpactCalculatorBody;
  try {
    body = await readJsonBody<ImpactCalculatorBody>(req);
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return;
  }

  const kpiCode =
    typeof body.kpi_code === "string" ? body.kpi_code.trim().toUpperCase() : "";
  const unit = typeof body.unit === "string" ? body.unit.trim() : "";
  if (!kpiCode) {
    sendJson(res, 400, { error: "kpi_code_required" });
    return;
  }
  if (body.gap_signed === undefined || !Number.isFinite(body.gap_signed)) {
    sendJson(res, 400, { error: "gap_signed_required" });
    return;
  }

  const pool = requirePool();
  const base = await loadImpactParams(pool, factoryId);
  const params = mergeImpactParams(base, {
    monthly_output_kg: body.monthly_output_kg,
    margin_per_kg: body.margin_per_kg,
    energy_cost_per_kwh: body.energy_cost_per_kwh,
  });
  const estimate = calculateImpact(kpiCode, body.gap_signed, unit, params);

  sendJson(res, 200, { estimate, params_used: params });
}
