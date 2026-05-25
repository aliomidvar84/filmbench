import type { IncomingMessage, ServerResponse } from "node:http";

import { insertAuditEvent } from "../audit/log.js";
import { notifyFactoryMembers } from "../notifications/insert.js";
import {
  type FactoryRole,
  type Membership,
  canViewDashboardAndReports,
  roleForFactory,
} from "../auth/rbac.js";
import { getPool, requirePool } from "../db.js";
import { toCsv } from "../http/csv.js";
import { sendJson, sendText } from "../http/respond.js";
import { isUuid, readJsonBody, requestUrl } from "../http/util.js";
import { requireAccessFromRequest } from "./auth-handlers.js";
import { assertDashboard } from "./dashboard-handlers.js";

const MAX_LIST = 200;
const VALID_STATUS = new Set(["open", "in_progress", "done", "cancelled"]);
const VALID_SOURCE = new Set([
  "manual",
  "validation_error",
  "validation_warning",
  "below_target",
  "below_peer_median",
]);

function assertCanManageActions(
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
  if (!canViewDashboardAndReports(role)) {
    sendJson(res, 403, { error: "forbidden" });
    return null;
  }
  return role;
}

function listFilters(url: URL): {
  status: string | null;
  lineId: string | null;
  periodId: string | null;
} {
  const statusRaw = url.searchParams.get("status")?.trim() ?? "";
  const status =
    statusRaw && VALID_STATUS.has(statusRaw) ? statusRaw : null;
  const lineIdRaw = url.searchParams.get("line_id")?.trim() ?? "";
  const periodIdRaw = url.searchParams.get("reporting_period_id")?.trim() ?? "";
  return {
    status,
    lineId: lineIdRaw && isUuid(lineIdRaw) ? lineIdRaw : lineIdRaw ? "invalid" : null,
    periodId:
      periodIdRaw && isUuid(periodIdRaw) ? periodIdRaw : periodIdRaw ? "invalid" : null,
  };
}

function rowString(record: Record<string, unknown>, keys: string[]): string[] {
  return keys.map((k) => {
    const v = record[k];
    if (v == null) return "";
    return String(v);
  });
}

export async function handleFactoryImprovementActions(
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
  const { status, lineId, periodId } = listFilters(url);
  if (lineId === "invalid") {
    sendJson(res, 400, { error: "invalid_line_id" });
    return;
  }
  if (periodId === "invalid") {
    sendJson(res, 400, { error: "invalid_reporting_period_id" });
    return;
  }
  if (url.searchParams.has("status") && url.searchParams.get("status")?.trim() && !status) {
    sendJson(res, 400, { error: "invalid_status" });
    return;
  }

  const pool = requirePool();
  const { rows } = await pool.query(
    `SELECT ia.id::text AS id,
            ia.title,
            ia.description,
            ia.status,
            ia.source_kind,
            ia.kpi_code,
            ia.due_date::text AS due_date,
            ia.created_at::text AS created_at,
            ia.updated_at::text AS updated_at,
            ia.line_id::text AS line_id,
            pl.line_code,
            ia.reporting_period_id::text AS reporting_period_id,
            rp.label AS period_label,
            u.email AS created_by_email
     FROM improvement_actions ia
     LEFT JOIN production_lines pl ON pl.id = ia.line_id
     LEFT JOIN reporting_periods rp ON rp.id = ia.reporting_period_id
     LEFT JOIN users u ON u.id = ia.created_by_user_id
     WHERE ia.factory_id = $1::uuid
       AND ($2::text IS NULL OR ia.status = $2::text)
       AND ($3::uuid IS NULL OR ia.line_id = $3::uuid)
       AND ($4::uuid IS NULL OR ia.reporting_period_id = $4::uuid)
     ORDER BY ia.updated_at DESC
     LIMIT $5::int`,
    [factoryId, status, lineId, periodId, MAX_LIST],
  );

  sendJson(res, 200, { improvement_actions: rows, limit: MAX_LIST });
}

interface CreateActionBody {
  title?: string;
  description?: string | null;
  line_id?: string | null;
  reporting_period_id?: string | null;
  kpi_code?: string | null;
  source_kind?: string;
  due_date?: string | null;
}

export async function handleCreateImprovementAction(
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
  if (!assertCanManageActions(res, claims.memberships, factoryId)) return;

  let body: CreateActionBody;
  try {
    body = await readJsonBody<CreateActionBody>(req);
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return;
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    sendJson(res, 400, { error: "title_required" });
    return;
  }

  const sourceKind =
    typeof body.source_kind === "string" && VALID_SOURCE.has(body.source_kind)
      ? body.source_kind
      : "manual";

  const lineId =
    typeof body.line_id === "string" && body.line_id.trim()
      ? body.line_id.trim()
      : null;
  const periodId =
    typeof body.reporting_period_id === "string" && body.reporting_period_id.trim()
      ? body.reporting_period_id.trim()
      : null;
  if (lineId && !isUuid(lineId)) {
    sendJson(res, 400, { error: "invalid_line_id" });
    return;
  }
  if (periodId && !isUuid(periodId)) {
    sendJson(res, 400, { error: "invalid_reporting_period_id" });
    return;
  }

  const kpiCode =
    typeof body.kpi_code === "string" && body.kpi_code.trim()
      ? body.kpi_code.trim()
      : null;
  const description =
    body.description === null || body.description === undefined
      ? null
      : typeof body.description === "string"
        ? body.description.trim() || null
        : null;
  const dueDate =
    typeof body.due_date === "string" && body.due_date.trim()
      ? body.due_date.trim()
      : null;

  const pool = requirePool();
  if (lineId) {
    const lineOk = await pool.query(
      `SELECT 1 FROM production_lines WHERE id = $1::uuid AND factory_id = $2::uuid`,
      [lineId, factoryId],
    );
    if (!lineOk.rowCount) {
      sendJson(res, 400, { error: "line_not_found" });
      return;
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO improvement_actions (
       factory_id,
       created_by_user_id,
       line_id,
       reporting_period_id,
       kpi_code,
       source_kind,
       title,
       description,
       due_date
     )
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9::date)
     RETURNING id::text AS id, status, title, source_kind, created_at::text AS created_at`,
    [
      factoryId,
      claims.sub,
      lineId,
      periodId,
      kpiCode,
      sourceKind,
      title,
      description,
      dueDate,
    ],
  );

  const row = rows[0];
  void insertAuditEvent(pool, {
    factoryId,
    actorUserId: claims.sub,
    action: "improvement_action.created",
    entityType: "improvement_action",
    entityId: row?.id ?? null,
    metadata: { title, source_kind: sourceKind, kpi_code: kpiCode },
  }).catch(() => {});

  void notifyFactoryMembers(
    pool,
    factoryId,
    {
      kind: "improvement_action",
      severity: "info",
      title: "New improvement action",
      body: title,
      href: "/actions",
      metadata: {
        improvement_action_id: row?.id,
        source_kind: sourceKind,
      },
    },
    { excludeUserIds: [claims.sub] },
  ).catch(() => {});

  sendJson(res, 201, { improvement_action: row });
}

interface PatchActionBody {
  status?: string;
  title?: string;
  description?: string | null;
  due_date?: string | null;
}

export async function handlePatchImprovementAction(
  req: IncomingMessage,
  res: ServerResponse,
  factoryId: string,
  actionId: string,
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
  if (!assertCanManageActions(res, claims.memberships, factoryId)) return;
  if (!isUuid(actionId)) {
    sendJson(res, 400, { error: "invalid_action_id" });
    return;
  }

  let body: PatchActionBody;
  try {
    body = await readJsonBody<PatchActionBody>(req);
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return;
  }

  const pool = requirePool();
  const cur = await pool.query<{ status: string; title: string }>(
    `SELECT status, title FROM improvement_actions
     WHERE id = $1::uuid AND factory_id = $2::uuid`,
    [actionId, factoryId],
  );
  if (!cur.rows[0]) {
    sendJson(res, 404, { error: "action_not_found" });
    return;
  }

  const newStatus =
    typeof body.status === "string" && VALID_STATUS.has(body.status)
      ? body.status
      : null;
  if (body.status !== undefined && !newStatus) {
    sendJson(res, 400, { error: "invalid_status" });
    return;
  }

  const newTitle =
    typeof body.title === "string" ? body.title.trim() : null;
  if (body.title !== undefined && !newTitle) {
    sendJson(res, 400, { error: "title_required" });
    return;
  }

  const newDescription =
    body.description === null
      ? null
      : typeof body.description === "string"
        ? body.description.trim() || null
        : undefined;

  const newDueDate =
    body.due_date === null
      ? null
      : typeof body.due_date === "string"
        ? body.due_date.trim() || null
        : undefined;

  if (
    newStatus === null &&
    newTitle === null &&
    newDescription === undefined &&
    newDueDate === undefined
  ) {
    sendJson(res, 400, { error: "no_fields_to_update" });
    return;
  }

  const { rows } = await pool.query(
    `UPDATE improvement_actions SET
       status = COALESCE($3, status),
       title = COALESCE($4, title),
       description = CASE WHEN $5::boolean THEN $6 ELSE description END,
       due_date = CASE WHEN $7::boolean THEN $8::date ELSE due_date END,
       updated_at = now()
     WHERE id = $1::uuid AND factory_id = $2::uuid
     RETURNING id::text AS id, status, title, updated_at::text AS updated_at`,
    [
      actionId,
      factoryId,
      newStatus,
      newTitle,
      newDescription !== undefined,
      newDescription ?? null,
      newDueDate !== undefined,
      newDueDate ?? null,
    ],
  );

  const row = rows[0];
  if (newStatus && newStatus !== cur.rows[0].status) {
    void insertAuditEvent(pool, {
      factoryId,
      actorUserId: claims.sub,
      action: "improvement_action.status_changed",
      entityType: "improvement_action",
      entityId: actionId,
      metadata: { from: cur.rows[0].status, to: newStatus },
    }).catch(() => {});
  }

  sendJson(res, 200, { improvement_action: row });
}

export async function handleExportImprovementActionsCsv(
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
  const { status, lineId, periodId } = listFilters(url);
  if (lineId === "invalid") {
    sendJson(res, 400, { error: "invalid_line_id" });
    return;
  }
  if (periodId === "invalid") {
    sendJson(res, 400, { error: "invalid_reporting_period_id" });
    return;
  }
  if (
    url.searchParams.has("status") &&
    url.searchParams.get("status")?.trim() &&
    !status
  ) {
    sendJson(res, 400, { error: "invalid_status" });
    return;
  }

  const pool = requirePool();
  const { rows } = await pool.query(
    `SELECT ia.id::text AS id,
            ia.title,
            ia.status,
            ia.source_kind,
            ia.kpi_code,
            pl.line_code,
            rp.label AS period_label,
            ia.due_date::text AS due_date,
            ia.description,
            ia.created_at::text AS created_at,
            ia.updated_at::text AS updated_at,
            u.email AS created_by_email
     FROM improvement_actions ia
     LEFT JOIN production_lines pl ON pl.id = ia.line_id
     LEFT JOIN reporting_periods rp ON rp.id = ia.reporting_period_id
     LEFT JOIN users u ON u.id = ia.created_by_user_id
     WHERE ia.factory_id = $1::uuid
       AND ($2::text IS NULL OR ia.status = $2::text)
       AND ($3::uuid IS NULL OR ia.line_id = $3::uuid)
       AND ($4::uuid IS NULL OR ia.reporting_period_id = $4::uuid)
     ORDER BY ia.updated_at DESC
     LIMIT $5::int`,
    [factoryId, status, lineId, periodId, MAX_LIST],
  );

  const recs = rows as Record<string, unknown>[];
  const keys =
    recs.length > 0
      ? Object.keys(recs[0]!)
      : [
          "id",
          "title",
          "status",
          "source_kind",
          "kpi_code",
          "line_code",
          "period_label",
          "due_date",
          "description",
          "created_at",
          "updated_at",
          "created_by_email",
        ];
  const data = recs.map((r) => rowString(r, keys));
  const csv = toCsv(keys, data);
  sendText(res, 200, `\ufeff${csv}`, "text/csv", {
    "content-disposition": `attachment; filename="filmbench-improvement-actions-${factoryId.slice(0, 8)}.csv"`,
  });
}
