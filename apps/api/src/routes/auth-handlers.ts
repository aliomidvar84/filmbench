import type { IncomingMessage, ServerResponse } from "node:http";

import { insertAuditEvent } from "../audit/log.js";
import { insertUserNotification } from "../notifications/insert.js";
import {
  hashPassword,
  validateNewPassword,
  verifyPassword,
} from "../auth/password.js";
import {
  findUserIdByRefreshToken,
  newRefreshTokenRaw,
  revokeAllRefreshTokensForUser,
  revokeRefreshToken,
  storeRefreshToken,
} from "../auth/refresh-store.js";
import type { Membership } from "../auth/rbac.js";
import { parseRole } from "../auth/rbac.js";
import { signAccessToken, verifyAccessToken } from "../auth/tokens.js";
import { accessTtlMinutes, jwtSecret, refreshTtlDays } from "../config.js";
import { getPool, requirePool } from "../db.js";
import { readJsonBody, extractBearer } from "../http/util.js";
import { sendJson } from "../http/respond.js";

interface LoginBody {
  email?: string;
  password?: string;
}

interface RefreshBody {
  refresh_token?: string;
}

interface LogoutBody {
  refresh_token?: string;
}

interface ChangePasswordBody {
  current_password?: string;
  new_password?: string;
}

async function loadMemberships(userId: string): Promise<Membership[]> {
  const pool = requirePool();
  const { rows } = await pool.query<{ factory_id: string; role: string }>(
    `SELECT factory_id::text, role
     FROM user_factory_memberships
     WHERE user_id = $1::uuid`,
    [userId],
  );
  const out: Membership[] = [];
  for (const r of rows) {
    const role = parseRole(r.role);
    if (!role) continue;
    out.push({ factory_id: r.factory_id, role });
  }
  return out;
}

export async function handleLogin(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!getPool()) {
    sendJson(res, 503, { error: "database_unconfigured" });
    return;
  }
  let body: LoginBody;
  try {
    body = await readJsonBody<LoginBody>(req);
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return;
  }
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    sendJson(res, 400, { error: "email_and_password_required" });
    return;
  }
  const pool = requirePool();
  const { rows } = await pool.query<{
    id: string;
    password_hash: string;
  }>(
    `SELECT id::text, password_hash
     FROM users
     WHERE email = $1 AND is_active`,
    [email],
  );
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    sendJson(res, 401, { error: "invalid_credentials" });
    return;
  }
  const memberships = await loadMemberships(user.id);
  let secret: string;
  try {
    secret = jwtSecret();
  } catch {
    sendJson(res, 503, { error: "auth_misconfigured" });
    return;
  }
  const access = signAccessToken(
    { sub: user.id, email, memberships },
    secret,
    accessTtlMinutes(),
  );
  const refreshRaw = newRefreshTokenRaw();
  const expires = new Date();
  expires.setDate(expires.getDate() + refreshTtlDays());
  await storeRefreshToken(user.id, refreshRaw, expires);
  sendJson(res, 200, {
    access_token: access,
    refresh_token: refreshRaw,
    token_type: "Bearer",
    expires_in: accessTtlMinutes() * 60,
  });
}

export async function handleRefresh(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!getPool()) {
    sendJson(res, 503, { error: "database_unconfigured" });
    return;
  }
  let body: RefreshBody;
  try {
    body = await readJsonBody<RefreshBody>(req);
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return;
  }
  const raw =
    typeof body.refresh_token === "string" ? body.refresh_token.trim() : "";
  if (!raw) {
    sendJson(res, 400, { error: "refresh_token_required" });
    return;
  }
  const userId = await findUserIdByRefreshToken(raw);
  if (!userId) {
    sendJson(res, 401, { error: "invalid_refresh_token" });
    return;
  }
  const pool = requirePool();
  const { rows } = await pool.query<{ email: string }>(
    `SELECT email FROM users WHERE id = $1::uuid AND is_active`,
    [userId],
  );
  const email = rows[0]?.email;
  if (!email) {
    sendJson(res, 401, { error: "user_inactive" });
    return;
  }
  const memberships = await loadMemberships(userId);
  let secret: string;
  try {
    secret = jwtSecret();
  } catch {
    sendJson(res, 503, { error: "auth_misconfigured" });
    return;
  }
  const access = signAccessToken(
    { sub: userId, email, memberships },
    secret,
    accessTtlMinutes(),
  );
  sendJson(res, 200, {
    access_token: access,
    token_type: "Bearer",
    expires_in: accessTtlMinutes() * 60,
  });
}

export async function handleLogout(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!getPool()) {
    sendJson(res, 503, { error: "database_unconfigured" });
    return;
  }
  let body: LogoutBody;
  try {
    body = await readJsonBody<LogoutBody>(req);
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return;
  }
  const raw =
    typeof body.refresh_token === "string" ? body.refresh_token.trim() : "";
  if (!raw) {
    sendJson(res, 400, { error: "refresh_token_required" });
    return;
  }
  await revokeRefreshToken(raw);
  sendJson(res, 200, { ok: true });
}

export async function handleChangePassword(
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

  let body: ChangePasswordBody;
  try {
    body = await readJsonBody<ChangePasswordBody>(req);
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return;
  }

  const current =
    typeof body.current_password === "string" ? body.current_password : "";
  const next = typeof body.new_password === "string" ? body.new_password : "";
  if (!current || !next) {
    sendJson(res, 400, { error: "current_and_new_password_required" });
    return;
  }
  const pwdErr = validateNewPassword(next);
  if (pwdErr) {
    sendJson(res, 400, { error: pwdErr });
    return;
  }
  if (current === next) {
    sendJson(res, 400, { error: "new_password_must_differ" });
    return;
  }

  const pool = requirePool();
  const { rows } = await pool.query<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = $1::uuid AND is_active`,
    [claims.sub],
  );
  const user = rows[0];
  if (!user || !(await verifyPassword(current, user.password_hash))) {
    sendJson(res, 401, { error: "invalid_current_password" });
    return;
  }

  const newHash = await hashPassword(next);
  await pool.query(
    `UPDATE users
     SET password_hash = $2, password_changed_at = now(), updated_at = now()
     WHERE id = $1::uuid`,
    [claims.sub, newHash],
  );
  await revokeAllRefreshTokensForUser(claims.sub);

  const memberships = claims.memberships;
  const factoryId = memberships[0]?.factory_id;
  if (factoryId) {
    void insertAuditEvent(pool, {
      factoryId,
      actorUserId: claims.sub,
      action: "user.password_changed",
      entityType: "user",
      entityId: claims.sub,
      metadata: {},
    }).catch(() => {});
  }

  void insertUserNotification(
    pool,
    claims.sub,
    {
      kind: "password_changed",
      severity: "info",
      title: "Password changed",
      body: "Your password was updated and existing refresh sessions were revoked.",
      href: "/account",
    },
    factoryId ?? null,
  ).catch(() => {});

  sendJson(res, 200, { ok: true });
}

export function requireAccessFromRequest(req: IncomingMessage) {
  const token = extractBearer(req.headers.authorization);
  if (!token) {
    const err = new Error("unauthorized") as Error & { status?: number };
    err.status = 401;
    throw err;
  }
  return verifyAccessToken(token, jwtSecret());
}
