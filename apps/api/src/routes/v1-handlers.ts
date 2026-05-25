import type { IncomingMessage, ServerResponse } from "node:http";

import {
  canAdminister,
  canUpload,
  canViewDashboardAndReports,
} from "../auth/rbac.js";
import { requireAccessFromRequest } from "./auth-handlers.js";
import { getPool, requirePool } from "../db.js";
import { sendJson } from "../http/respond.js";

export async function handleMe(
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
  const { rows } = await pool.query<{
    id: string;
    email: string;
    full_name: string | null;
  }>(
    `SELECT id::text, email, full_name
     FROM users
     WHERE id = $1::uuid AND is_active`,
    [claims.sub],
  );
  const user = rows[0];
  if (!user) {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }
  const memberships = await pool.query<{
    factory_id: string;
    role: string;
  }>(
    `SELECT factory_id::text, role
     FROM user_factory_memberships
     WHERE user_id = $1::uuid`,
    [claims.sub],
  );
  sendJson(res, 200, {
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
    },
    memberships: memberships.rows,
  });
}

export async function handleFactories(
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
  const { rows } = await pool.query<{
    id: string;
    anonymized_code: string;
    factory_name: string;
    region: string | null;
    role: string;
    can_view_dashboard: boolean;
    can_upload: boolean;
    can_administer: boolean;
  }>(
    `SELECT f.id::text,
            f.anonymized_code,
            f.factory_name,
            f.region,
            m.role,
            (m.role IN ('admin', 'manager')) AS can_view_dashboard,
            (m.role IN ('admin', 'analyst')) AS can_upload,
            (m.role = 'admin') AS can_administer
     FROM factories f
     INNER JOIN user_factory_memberships m ON m.factory_id = f.id
     WHERE m.user_id = $1::uuid AND f.is_active
     ORDER BY f.factory_name`,
    [claims.sub],
  );
  sendJson(res, 200, { factories: rows });
}

export async function handleFactoryCapabilities(
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
  const role =
    claims.memberships.find((m) => m.factory_id === factoryId)?.role ?? null;
  if (!role) {
    sendJson(res, 403, { error: "forbidden" });
    return;
  }
  sendJson(res, 200, {
    factory_id: factoryId,
    role,
    capabilities: {
      upload: canUpload(role),
      dashboard_and_reports: canViewDashboardAndReports(role),
      administration: canAdminister(role),
    },
  });
}
