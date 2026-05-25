import type { IncomingMessage, ServerResponse } from "node:http";

import {
  isClickHouseEnabled,
  pingClickHouse,
  syncFactoryAnalytics,
} from "@filmbench/analytics";

import {
  type FactoryRole,
  type Membership,
  canAdminister,
  roleForFactory,
} from "../auth/rbac.js";
import { insertAuditEvent } from "../audit/log.js";
import { getPool, requirePool } from "../db.js";
import { sendJson } from "../http/respond.js";
import { isUuid, readJsonBody } from "../http/util.js";
import { requireAccessFromRequest } from "./auth-handlers.js";

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
  if (!role || !canAdminister(role)) {
    sendJson(res, 403, { error: "forbidden" });
    return null;
  }
  return role;
}

interface SyncBody {
  reporting_period_ids?: string[];
  full?: boolean;
}

export async function handleAnalyticsSync(
  req: IncomingMessage,
  res: ServerResponse,
  factoryId: string,
): Promise<void> {
  if (!getPool()) {
    sendJson(res, 503, { error: "database_unconfigured" });
    return;
  }
  if (!isClickHouseEnabled()) {
    sendJson(res, 503, { error: "clickhouse_disabled" });
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

  let body: SyncBody = {};
  try {
    body = await readJsonBody<SyncBody>(req);
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return;
  }

  const periodIds =
    body.full === true
      ? null
      : (body.reporting_period_ids ?? [])
          .map((id) => id.trim())
          .filter((id) => isUuid(id));

  const pool = requirePool();
  const result = await syncFactoryAnalytics(pool, factoryId, periodIds);

  void insertAuditEvent(pool, {
    factoryId,
    actorUserId: claims.sub,
    action: "analytics.synced",
    entityType: "analytics_sync_log",
    entityId: result.sync_log_id ?? factoryId,
    metadata: {
      ok: result.ok,
      kpi_rows_synced: result.kpi_rows_synced,
      benchmark_rows_synced: result.benchmark_rows_synced,
      error: result.error,
    },
  }).catch(() => {});

  if (!result.ok) {
    sendJson(res, 500, { error: "sync_failed", message: result.error });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    kpi_rows_synced: result.kpi_rows_synced,
    benchmark_rows_synced: result.benchmark_rows_synced,
    sync_log_id: result.sync_log_id,
  });
}

export async function handleAnalyticsStatus(
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

  const pool = requirePool();
  const { rows } = await pool.query(
    `SELECT id::text,
            sync_kind,
            reporting_period_ids,
            kpi_rows_synced,
            benchmark_rows_synced,
            status,
            error_message,
            started_at::text AS started_at,
            completed_at::text AS completed_at
     FROM analytics_sync_log
     WHERE factory_id = $1::uuid
     ORDER BY started_at DESC
     LIMIT 10`,
    [factoryId],
  );

  const ch = await pingClickHouse();
  sendJson(res, 200, {
    clickhouse_enabled: isClickHouseEnabled(),
    clickhouse_health: ch,
    recent_syncs: rows,
  });
}
