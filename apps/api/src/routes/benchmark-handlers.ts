import type { IncomingMessage, ServerResponse } from "node:http";

import { scheduleAnalyticsSync } from "@filmbench/analytics";

import { insertAuditEvent } from "../audit/log.js";
import {
  parseBenchmarkFilters,
  queryBenchmarkFilterOptions,
  queryBenchmarkRows,
} from "../benchmark/comparison.js";
import { getPool, requirePool } from "../db.js";
import { sendJson } from "../http/respond.js";
import { isUuid, readJsonBody, requestUrl } from "../http/util.js";
import { requireAccessFromRequest } from "./auth-handlers.js";
import { assertDashboard } from "./dashboard-handlers.js";

const MAX_EXEC_LOG = 20;

interface RefreshBenchmarkBody {
  reporting_period_id?: string;
  line_id?: string | null;
}

export async function handleFactoryBenchmarkComparison(
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
  const rows = await queryBenchmarkRows(pool, factoryId, parsed.filters);
  sendJson(res, 200, { benchmark_rows: rows });
}

export async function handleBenchmarkFilterOptions(
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
  if (!isUuid(periodId)) {
    sendJson(res, 400, { error: "reporting_period_id_required" });
    return;
  }

  const pool = requirePool();
  const options = await queryBenchmarkFilterOptions(pool, factoryId, periodId);
  sendJson(res, 200, options);
}

export async function handleRefreshFactoryBenchmarks(
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

  let body: RefreshBenchmarkBody = {};
  try {
    const raw = await readJsonBody<RefreshBenchmarkBody>(req);
    body = raw ?? {};
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return;
  }

  const periodId = body.reporting_period_id?.trim() ?? "";
  const lineIdRaw =
    body.line_id === null || body.line_id === undefined
      ? ""
      : String(body.line_id).trim();
  const lineId = lineIdRaw && isUuid(lineIdRaw) ? lineIdRaw : null;
  if (lineIdRaw && !lineId) {
    sendJson(res, 400, { error: "invalid_line_id" });
    return;
  }
  if (periodId && !isUuid(periodId)) {
    sendJson(res, 400, { error: "invalid_reporting_period_id" });
    return;
  }

  const pool = requirePool();
  if (periodId) {
    const periodCheck = await pool.query(
      `SELECT 1 FROM reporting_periods WHERE id = $1::uuid`,
      [periodId],
    );
    if (!periodCheck.rowCount) {
      sendJson(res, 404, { error: "period_not_found" });
      return;
    }
  }

  const { rows: factoryLines } = await pool.query<{ id: string }>(
    `SELECT id::text FROM production_lines WHERE factory_id = $1::uuid`,
    [factoryId],
  );

  const targets =
    lineId != null
      ? [{ id: lineId }]
      : factoryLines.length > 0
        ? factoryLines
        : [{ id: null as string | null }];

  for (const t of targets) {
    await pool.query(`SELECT refresh_kpis_then_benchmarks($1::uuid, $2::uuid)`, [
      t.id,
      periodId || null,
    ]);
  }

  const { rows: logRows } = await pool.query<{
    id: string;
    entity_rows_written: number;
    cohort_fallback_count: number;
    duration_ms: number | null;
    finished_at: string;
  }>(
    `SELECT id::text,
            entity_rows_written,
            cohort_fallback_count,
            duration_ms,
            finished_at::text AS finished_at
     FROM benchmark_execution_log
     WHERE ($1::uuid IS NULL OR reporting_period_id = $1::uuid)
       AND ($2::uuid IS NULL OR line_id = $2::uuid)
     ORDER BY finished_at DESC
     LIMIT 1`,
    [periodId || null, lineId],
  );

  if (periodId) {
    scheduleAnalyticsSync(pool, factoryId, [periodId]);
  } else {
    scheduleAnalyticsSync(pool, factoryId, null);
  }

  void insertAuditEvent(pool, {
    factoryId,
    actorUserId: claims.sub,
    action: "benchmark.refreshed",
    entityType: "benchmark_execution_log",
    entityId: logRows[0]?.id ?? null,
    metadata: {
      reporting_period_id: periodId || null,
      line_id: lineId,
      entity_rows_written: logRows[0]?.entity_rows_written ?? 0,
      cohort_fallback_count: logRows[0]?.cohort_fallback_count ?? 0,
    },
  }).catch(() => {});

  sendJson(res, 200, {
    ok: true,
    execution: logRows[0] ?? null,
  });
}

export async function handleBenchmarkExecutionLog(
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

  const pool = requirePool();
  const params: unknown[] = [factoryId, MAX_EXEC_LOG];
  let clause = "";
  if (periodId && isUuid(periodId)) {
    params.splice(1, 0, periodId);
    clause = ` AND bel.reporting_period_id = $2::uuid`;
  }

  const { rows } = await pool.query(
    `SELECT bel.id::text,
            bel.reporting_period_id::text,
            bel.line_id::text,
            bel.status,
            bel.entity_rows_written,
            bel.cohort_fallback_count,
            bel.duration_ms,
            bel.started_at::text AS started_at,
            bel.finished_at::text AS finished_at
     FROM benchmark_execution_log bel
     WHERE bel.line_id IS NULL
        OR bel.line_id IN (
          SELECT pl.id FROM production_lines pl WHERE pl.factory_id = $1::uuid
        )${clause}
     ORDER BY bel.finished_at DESC
     LIMIT $${params.length}::int`,
    params,
  );

  sendJson(res, 200, { executions: rows });
}
