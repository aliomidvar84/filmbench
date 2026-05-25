import type { IncomingMessage, ServerResponse } from "node:http";

import { insertAuditEvent } from "../audit/log.js";
import {
  type FactoryRole,
  type Membership,
  canAdminister,
  roleForFactory,
} from "../auth/rbac.js";
import { getPool, requirePool } from "../db.js";
import { sendJson } from "../http/respond.js";
import { isUuid, readJsonBody, requestUrl } from "../http/util.js";
import { requireAccessFromRequest } from "./auth-handlers.js";
import { assertDashboard } from "./dashboard-handlers.js";

function assertAdminister(
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
  if (!canAdminister(role)) {
    sendJson(res, 403, { error: "forbidden" });
    return null;
  }
  return role;
}

export async function handleFactoryKpiTargets(
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
    `SELECT kd.kpi_code,
            kd.name AS kpi_name,
            kd.category,
            kd.unit AS definition_unit,
            kd.direction,
            kd.tier,
            t.target_value::text AS target_value,
            t.notes,
            t.updated_at::text AS target_updated_at
     FROM kpi_definitions kd
     LEFT JOIN factory_kpi_targets t
       ON t.kpi_code = kd.kpi_code AND t.factory_id = $1::uuid
     ORDER BY kd.tier, kd.kpi_code`,
    [factoryId],
  );
  sendJson(res, 200, { kpi_targets: rows });
}

interface UpsertTargetRow {
  kpi_code?: string;
  target_value?: number | string;
  notes?: string | null;
}

interface UpsertTargetsBody {
  targets?: UpsertTargetRow[];
}

export async function handlePutFactoryKpiTargets(
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
  if (!assertAdminister(res, claims.memberships, factoryId)) return;

  let body: UpsertTargetsBody;
  try {
    body = await readJsonBody<UpsertTargetsBody>(req);
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return;
  }
  const rows = body.targets;
  if (!Array.isArray(rows) || rows.length === 0) {
    sendJson(res, 400, { error: "targets_required" });
    return;
  }

  const pool = requirePool();
  const saved: { kpi_code: string; target_value: string }[] = [];

  for (const row of rows) {
    const kpiCode =
      typeof row.kpi_code === "string" ? row.kpi_code.trim() : "";
    const rawVal = row.target_value;
    const num =
      typeof rawVal === "number"
        ? rawVal
        : typeof rawVal === "string"
          ? Number(rawVal)
          : NaN;
    if (!kpiCode || !Number.isFinite(num)) {
      sendJson(res, 400, { error: "invalid_target_row", kpi_code: kpiCode || null });
      return;
    }
    const notes =
      row.notes === null || row.notes === undefined
        ? null
        : typeof row.notes === "string"
          ? row.notes.trim() || null
          : null;

    const def = await pool.query(
      `SELECT 1 FROM kpi_definitions WHERE kpi_code = $1`,
      [kpiCode],
    );
    if (!def.rowCount) {
      sendJson(res, 400, { error: "unknown_kpi_code", kpi_code: kpiCode });
      return;
    }

    const { rows: upserted } = await pool.query<{ kpi_code: string; target_value: string }>(
      `INSERT INTO factory_kpi_targets (factory_id, kpi_code, target_value, notes)
       VALUES ($1::uuid, $2, $3, $4)
       ON CONFLICT (factory_id, kpi_code) DO UPDATE SET
         target_value = EXCLUDED.target_value,
         notes = EXCLUDED.notes,
         updated_at = now()
       RETURNING kpi_code, target_value::text AS target_value`,
      [factoryId, kpiCode, num, notes],
    );
    const savedRow = upserted[0];
    if (savedRow) saved.push(savedRow);
  }

  void insertAuditEvent(pool, {
    factoryId,
    actorUserId: claims.sub,
    action: "kpi_targets.upserted",
    entityType: "factory_kpi_targets",
    entityId: factoryId,
    metadata: { count: saved.length, kpi_codes: saved.map((s) => s.kpi_code) },
  }).catch(() => {});

  sendJson(res, 200, { saved });
}

export async function handleFactoryKpiTargetComparison(
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
    `SELECT pl.line_code,
            kr.kpi_code,
            kd.name AS kpi_name,
            kd.direction,
            kd.unit AS definition_unit,
            kr.kpi_value::text AS current_value,
            t.target_value::text AS target_value,
            CASE
              WHEN t.target_value IS NULL OR kr.kpi_value IS NULL THEN NULL
              WHEN kd.direction = 'higher' THEN (kr.kpi_value - t.target_value)::text
              ELSE (t.target_value - kr.kpi_value)::text
            END AS gap_to_target_signed,
            CASE
              WHEN t.target_value IS NULL THEN 'no_target'
              WHEN kr.kpi_value IS NULL THEN 'no_current_value'
              WHEN kd.direction = 'higher' AND kr.kpi_value >= t.target_value THEN 'at_or_above_target'
              WHEN kd.direction = 'lower' AND kr.kpi_value <= t.target_value THEN 'at_or_above_target'
              ELSE 'below_target'
            END AS target_status,
            v.peer_p50::text AS peer_p50,
            v.comparison_status AS peer_comparison_status
     FROM kpi_results kr
     INNER JOIN kpi_definitions kd ON kd.kpi_code = kr.kpi_code
     INNER JOIN production_lines pl ON pl.id = kr.line_id
     LEFT JOIN factory_kpi_targets t
       ON t.factory_id = kr.factory_id AND t.kpi_code = kr.kpi_code
     LEFT JOIN vw_kpi_benchmark_comparison v ON v.kpi_result_id = kr.id
     WHERE kr.factory_id = $1::uuid
       AND kr.reporting_period_id = $2::uuid
       AND ($3::uuid IS NULL OR kr.line_id = $3::uuid)
       AND kr.calculation_status = 'ok'
     ORDER BY pl.line_code, kd.tier, kr.kpi_code`,
    [factoryId, periodId, lineIdRaw || null],
  );

  sendJson(res, 200, {
    reporting_period_id: periodId,
    line_id: lineIdRaw || null,
    rows,
  });
}
