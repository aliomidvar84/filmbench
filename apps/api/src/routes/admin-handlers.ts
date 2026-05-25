import type { IncomingMessage, ServerResponse } from "node:http";

import {
  type FactoryRole,
  type Membership,
  canAdminister,
  canViewDashboardAndReports,
  parseRole,
  roleForFactory,
} from "../auth/rbac.js";
import { insertAuditEvent } from "../audit/log.js";
import { getPool, requirePool } from "../db.js";
import { sendJson } from "../http/respond.js";
import { isUuid, readJsonBody } from "../http/util.js";
import { requireAccessFromRequest } from "./auth-handlers.js";

function assertFactoryMember(
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

function assertAdminister(
  res: ServerResponse,
  memberships: Membership[],
  factoryId: string,
): FactoryRole | null {
  const role = assertFactoryMember(res, memberships, factoryId);
  if (!role) return null;
  if (!canAdminister(role)) {
    sendJson(res, 403, { error: "forbidden" });
    return null;
  }
  return role;
}

function assertTeamViewer(
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

async function countFactoryAdmins(
  factoryId: string,
  excludeUserId: string | null,
): Promise<number> {
  const pool = requirePool();
  const { rows } = await pool.query<{ n: string }>(
    `SELECT count(*)::text AS n
     FROM user_factory_memberships
     WHERE factory_id = $1::uuid
       AND role = 'admin'
       AND ($2::uuid IS NULL OR user_id <> $2::uuid)`,
    [factoryId, excludeUserId],
  );
  return Number(rows[0]?.n ?? 0);
}

/** Any factory member — upload/analytics audit trail. */
export async function handleFactoryIngestionBatches(
  _req: IncomingMessage,
  res: ServerResponse,
  factoryId: string,
): Promise<void> {
  if (!getPool()) {
    sendJson(res, 503, { error: "database_unconfigured" });
    return;
  }
  let claims;
  try {
    claims = requireAccessFromRequest(_req);
  } catch {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }
  if (!assertFactoryMember(res, claims.memberships, factoryId)) return;

  const pool = requirePool();
  const { rows } = await pool.query(
    `SELECT ib.id::text,
            ib.original_filename,
            ib.storage_path,
            ib.status,
            ib.row_count,
            ib.summary,
            ib.error_message,
            ib.created_at::text AS created_at,
            ib.completed_at::text AS completed_at,
            u.email AS uploaded_by_email
     FROM ingestion_batches ib
     INNER JOIN users u ON u.id = ib.uploaded_by_user_id
     WHERE ib.factory_id = $1::uuid
     ORDER BY ib.created_at DESC
     LIMIT 100`,
    [factoryId],
  );
  sendJson(res, 200, { ingestion_batches: rows });
}

/** Managers and admins — roster without passwords. */
export async function handleListFactoryMembers(
  _req: IncomingMessage,
  res: ServerResponse,
  factoryId: string,
): Promise<void> {
  if (!getPool()) {
    sendJson(res, 503, { error: "database_unconfigured" });
    return;
  }
  let claims;
  try {
    claims = requireAccessFromRequest(_req);
  } catch {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }
  if (!assertTeamViewer(res, claims.memberships, factoryId)) return;

  const pool = requirePool();
  const { rows } = await pool.query(
    `SELECT u.id::text AS user_id,
            u.email,
            u.full_name,
            m.role,
            m.created_at::text AS membership_created_at
     FROM user_factory_memberships m
     INNER JOIN users u ON u.id = m.user_id
     WHERE m.factory_id = $1::uuid AND u.is_active
     ORDER BY u.email`,
    [factoryId],
  );
  sendJson(res, 200, { members: rows });
}

interface AddMemberBody {
  email?: string;
  role?: string;
}

export async function handleAddFactoryMember(
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

  let body: AddMemberBody;
  try {
    body = await readJsonBody<AddMemberBody>(req);
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return;
  }
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const newRole = parseRole(typeof body.role === "string" ? body.role : "");
  if (!email || !newRole) {
    sendJson(res, 400, { error: "email_and_role_required" });
    return;
  }

  const pool = requirePool();
  const user = await pool.query<{ id: string }>(
    `SELECT id::text FROM users WHERE email = $1 AND is_active`,
    [email],
  );
  const userId = user.rows[0]?.id;
  if (!userId) {
    sendJson(res, 404, { error: "user_not_found" });
    return;
  }

  const { rows } = await pool.query(
    `INSERT INTO user_factory_memberships (user_id, factory_id, role)
     VALUES ($1::uuid, $2::uuid, $3)
     ON CONFLICT (user_id, factory_id) DO UPDATE SET role = EXCLUDED.role
     RETURNING user_id::text, factory_id::text, role`,
    [userId, factoryId, newRole],
  );
  const row = rows[0] as {
    user_id: string;
    factory_id: string;
    role: string;
  };
  void insertAuditEvent(pool, {
    factoryId,
    actorUserId: claims.sub,
    action: "membership.upsert",
    entityType: "user_factory_membership",
    entityId: userId,
    metadata: { email, role: newRole },
  }).catch(() => {});
  sendJson(res, 200, { membership: row });
}

interface PatchMemberBody {
  role?: string;
}

export async function handlePatchFactoryMember(
  req: IncomingMessage,
  res: ServerResponse,
  factoryId: string,
  memberUserId: string,
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
  if (!isUuid(memberUserId)) {
    sendJson(res, 400, { error: "invalid_user_id" });
    return;
  }

  let body: PatchMemberBody;
  try {
    body = await readJsonBody<PatchMemberBody>(req);
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return;
  }
  const newRole = parseRole(typeof body.role === "string" ? body.role : "");
  if (!newRole) {
    sendJson(res, 400, { error: "role_required" });
    return;
  }

  const pool = requirePool();
  const cur = await pool.query<{ role: string }>(
    `SELECT role FROM user_factory_memberships
     WHERE user_id = $1::uuid AND factory_id = $2::uuid`,
    [memberUserId, factoryId],
  );
  if (!cur.rows[0]) {
    sendJson(res, 404, { error: "membership_not_found" });
    return;
  }
  if (cur.rows[0].role === "admin" && newRole !== "admin") {
    const remaining = await countFactoryAdmins(factoryId, memberUserId);
    if (remaining < 1) {
      sendJson(res, 400, { error: "last_factory_admin" });
      return;
    }
  }

  const prevRole = cur.rows[0].role;
  await pool.query(
    `UPDATE user_factory_memberships SET role = $3
     WHERE user_id = $1::uuid AND factory_id = $2::uuid`,
    [memberUserId, factoryId, newRole],
  );
  void insertAuditEvent(pool, {
    factoryId,
    actorUserId: claims.sub,
    action: "membership.role_changed",
    entityType: "user_factory_membership",
    entityId: memberUserId,
    metadata: { from_role: prevRole, to_role: newRole },
  }).catch(() => {});
  sendJson(res, 200, {
    membership: { user_id: memberUserId, factory_id: factoryId, role: newRole },
  });
}

export async function handleRemoveFactoryMember(
  _req: IncomingMessage,
  res: ServerResponse,
  factoryId: string,
  memberUserId: string,
): Promise<void> {
  if (!getPool()) {
    sendJson(res, 503, { error: "database_unconfigured" });
    return;
  }
  let claims;
  try {
    claims = requireAccessFromRequest(_req);
  } catch {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }
  if (!assertAdminister(res, claims.memberships, factoryId)) return;
  if (!isUuid(memberUserId)) {
    sendJson(res, 400, { error: "invalid_user_id" });
    return;
  }

  if (memberUserId === claims.sub) {
    sendJson(res, 400, { error: "cannot_remove_self" });
    return;
  }

  const pool = requirePool();
  const cur = await pool.query<{ role: string }>(
    `SELECT role FROM user_factory_memberships
     WHERE user_id = $1::uuid AND factory_id = $2::uuid`,
    [memberUserId, factoryId],
  );
  if (!cur.rows[0]) {
    sendJson(res, 404, { error: "membership_not_found" });
    return;
  }
  if (cur.rows[0].role === "admin") {
    const remaining = await countFactoryAdmins(factoryId, memberUserId);
    if (remaining < 1) {
      sendJson(res, 400, { error: "last_factory_admin" });
      return;
    }
  }

  const del = await pool.query(
    `DELETE FROM user_factory_memberships
     WHERE user_id = $1::uuid AND factory_id = $2::uuid`,
    [memberUserId, factoryId],
  );
  if (del.rowCount === 0) {
    sendJson(res, 404, { error: "membership_not_found" });
    return;
  }
  void insertAuditEvent(pool, {
    factoryId,
    actorUserId: claims.sub,
    action: "membership.removed",
    entityType: "user_factory_membership",
    entityId: memberUserId,
    metadata: { removed_role: cur.rows[0].role },
  }).catch(() => {});
  sendJson(res, 200, { ok: true });
}
