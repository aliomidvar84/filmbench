import type { IncomingMessage, ServerResponse } from "node:http";

import { getPool, requirePool } from "../db.js";
import { sendJson } from "../http/respond.js";
import { isUuid, requestUrl } from "../http/util.js";
import { requireAccessFromRequest } from "./auth-handlers.js";

const MAX_LIST = 100;

function parseLimit(url: URL): number {
  const raw = url.searchParams.get("limit")?.trim() ?? "";
  const n = raw ? Number.parseInt(raw, 10) : 50;
  if (!Number.isFinite(n) || n < 1) return 50;
  return Math.min(n, MAX_LIST);
}

export async function handleListNotifications(
  req: IncomingMessage,
  res: ServerResponse,
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

  const url = requestUrl(req);
  const unreadOnly = url.searchParams.get("unread_only") === "true";
  const limit = parseLimit(url);
  const factoryIdRaw = url.searchParams.get("factory_id")?.trim() ?? "";
  if (factoryIdRaw && !isUuid(factoryIdRaw)) {
    sendJson(res, 400, { error: "invalid_factory_id" });
    return;
  }

  const pool = requirePool();
  const params: unknown[] = [claims.sub, limit];
  let factoryFilter = "";
  if (factoryIdRaw) {
    params.push(factoryIdRaw);
    factoryFilter = ` AND (n.factory_id IS NULL OR n.factory_id = $${params.length}::uuid)`;
  }

  const { rows } = await pool.query(
    `SELECT
       n.id::text,
       n.factory_id::text,
       f.factory_name,
       n.kind,
       n.severity,
       n.title,
       n.body,
       n.href,
       n.metadata,
       n.read_at,
       n.created_at
     FROM user_notifications n
     LEFT JOIN factories f ON f.id = n.factory_id
     WHERE n.user_id = $1::uuid
       ${unreadOnly ? "AND n.read_at IS NULL" : ""}
       ${factoryFilter}
     ORDER BY n.created_at DESC
     LIMIT $2::int`,
    params,
  );

  sendJson(res, 200, { notifications: rows });
}

export async function handleNotificationsUnreadCount(
  req: IncomingMessage,
  res: ServerResponse,
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

  const pool = requirePool();
  const { rows } = await pool.query<{ unread: number }>(
    `SELECT count(*)::int AS unread
     FROM user_notifications
     WHERE user_id = $1::uuid AND read_at IS NULL`,
    [claims.sub],
  );

  sendJson(res, 200, { unread: rows[0]?.unread ?? 0 });
}

export async function handlePatchNotification(
  req: IncomingMessage,
  res: ServerResponse,
  notificationId: string,
): Promise<void> {
  if (!getPool()) {
    sendJson(res, 503, { error: "database_unconfigured" });
    return;
  }
  if (!isUuid(notificationId)) {
    sendJson(res, 400, { error: "invalid_notification_id" });
    return;
  }
  let claims;
  try {
    claims = requireAccessFromRequest(req);
  } catch {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }

  const pool = requirePool();
  const { rowCount } = await pool.query(
    `UPDATE user_notifications
     SET read_at = COALESCE(read_at, now())
     WHERE id = $1::uuid AND user_id = $2::uuid`,
    [notificationId, claims.sub],
  );
  if (!rowCount) {
    sendJson(res, 404, { error: "notification_not_found" });
    return;
  }
  sendJson(res, 200, { ok: true });
}

export async function handleMarkAllNotificationsRead(
  req: IncomingMessage,
  res: ServerResponse,
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

  const pool = requirePool();
  const { rowCount } = await pool.query(
    `UPDATE user_notifications
     SET read_at = now()
     WHERE user_id = $1::uuid AND read_at IS NULL`,
    [claims.sub],
  );
  sendJson(res, 200, { ok: true, marked_read: rowCount ?? 0 });
}
