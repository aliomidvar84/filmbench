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

interface SettingsRow {
  factory_id: string;
  factory_name: string;
  anonymized_code: string;
  display_name: string | null;
  currency_code: string;
  timezone: string;
  normalize_by_capacity: boolean;
  normalize_by_width: boolean;
  margin_per_kg: string | null;
  energy_cost_per_kwh: string | null;
  default_monthly_output_kg: string;
  updated_at: string;
}

async function loadSettings(
  pool: ReturnType<typeof requirePool>,
  factoryId: string,
): Promise<SettingsRow | null> {
  const { rows } = await pool.query<SettingsRow>(
    `SELECT f.id::text AS factory_id,
            f.factory_name,
            f.anonymized_code,
            COALESCE(s.display_name, f.factory_name) AS display_name,
            COALESCE(s.currency_code, 'EUR') AS currency_code,
            COALESCE(s.timezone, 'UTC') AS timezone,
            COALESCE(s.normalize_by_capacity, FALSE) AS normalize_by_capacity,
            COALESCE(s.normalize_by_width, TRUE) AS normalize_by_width,
            s.margin_per_kg::text,
            s.energy_cost_per_kwh::text,
            COALESCE(s.default_monthly_output_kg, 50000)::text AS default_monthly_output_kg,
            COALESCE(s.updated_at, f.updated_at)::text AS updated_at
     FROM factories f
     LEFT JOIN factory_settings s ON s.factory_id = f.id
     WHERE f.id = $1::uuid`,
    [factoryId],
  );
  return rows[0] ?? null;
}

export async function handleGetFactorySettings(
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
  const row = await loadSettings(pool, factoryId);
  if (!row) {
    sendJson(res, 404, { error: "factory_not_found" });
    return;
  }
  sendJson(res, 200, { settings: row });
}

interface PatchSettingsBody {
  display_name?: string | null;
  currency_code?: string;
  timezone?: string;
  normalize_by_capacity?: boolean;
  normalize_by_width?: boolean;
  margin_per_kg?: number;
  energy_cost_per_kwh?: number;
  default_monthly_output_kg?: number;
}

function isCurrency(code: string): boolean {
  return /^[A-Z]{3}$/.test(code);
}

function isPositiveNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

export async function handlePatchFactorySettings(
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

  let body: PatchSettingsBody;
  try {
    body = await readJsonBody<PatchSettingsBody>(req);
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return;
  }

  const pool = requirePool();
  const before = await loadSettings(pool, factoryId);
  if (!before) {
    sendJson(res, 404, { error: "factory_not_found" });
    return;
  }

  await pool.query(
    `INSERT INTO factory_settings (factory_id, display_name, currency_code)
     SELECT id, factory_name, 'EUR' FROM factories WHERE id = $1::uuid
     ON CONFLICT (factory_id) DO NOTHING`,
    [factoryId],
  );

  const sets: string[] = [];
  const vals: unknown[] = [factoryId];
  let idx = 2;

  if (body.display_name !== undefined) {
    const dn =
      body.display_name === null
        ? null
        : typeof body.display_name === "string"
          ? body.display_name.trim() || null
          : null;
    sets.push(`display_name = $${idx}`);
    vals.push(dn);
    idx += 1;
  }
  if (body.currency_code !== undefined) {
    const cc =
      typeof body.currency_code === "string"
        ? body.currency_code.trim().toUpperCase()
        : "";
    if (!isCurrency(cc)) {
      sendJson(res, 400, { error: "invalid_currency_code" });
      return;
    }
    sets.push(`currency_code = $${idx}`);
    vals.push(cc);
    idx += 1;
  }
  if (body.timezone !== undefined) {
    const tz =
      typeof body.timezone === "string" ? body.timezone.trim() : "";
    if (!tz) {
      sendJson(res, 400, { error: "invalid_timezone" });
      return;
    }
    sets.push(`timezone = $${idx}`);
    vals.push(tz);
    idx += 1;
  }
  if (body.normalize_by_capacity !== undefined) {
    if (typeof body.normalize_by_capacity !== "boolean") {
      sendJson(res, 400, { error: "invalid_normalize_by_capacity" });
      return;
    }
    sets.push(`normalize_by_capacity = $${idx}`);
    vals.push(body.normalize_by_capacity);
    idx += 1;
  }
  if (body.normalize_by_width !== undefined) {
    if (typeof body.normalize_by_width !== "boolean") {
      sendJson(res, 400, { error: "invalid_normalize_by_width" });
      return;
    }
    sets.push(`normalize_by_width = $${idx}`);
    vals.push(body.normalize_by_width);
    idx += 1;
  }
  if (body.margin_per_kg !== undefined) {
    if (!isPositiveNumber(body.margin_per_kg)) {
      sendJson(res, 400, { error: "invalid_margin_per_kg" });
      return;
    }
    sets.push(`margin_per_kg = $${idx}`);
    vals.push(body.margin_per_kg);
    idx += 1;
  }
  if (body.energy_cost_per_kwh !== undefined) {
    if (!isPositiveNumber(body.energy_cost_per_kwh)) {
      sendJson(res, 400, { error: "invalid_energy_cost_per_kwh" });
      return;
    }
    sets.push(`energy_cost_per_kwh = $${idx}`);
    vals.push(body.energy_cost_per_kwh);
    idx += 1;
  }
  if (body.default_monthly_output_kg !== undefined) {
    if (!isPositiveNumber(body.default_monthly_output_kg)) {
      sendJson(res, 400, { error: "invalid_default_monthly_output_kg" });
      return;
    }
    sets.push(`default_monthly_output_kg = $${idx}`);
    vals.push(body.default_monthly_output_kg);
    idx += 1;
  }

  if (sets.length === 0) {
    sendJson(res, 400, { error: "no_fields_to_update" });
    return;
  }

  sets.push("updated_at = now()");
  await pool.query(
    `UPDATE factory_settings SET ${sets.join(", ")} WHERE factory_id = $1::uuid`,
    vals,
  );

  const after = await loadSettings(pool, factoryId);
  if (!after) {
    sendJson(res, 404, { error: "factory_not_found" });
    return;
  }

  void insertAuditEvent(pool, {
    factoryId,
    actorUserId: claims.sub,
    action: "factory_settings.updated",
    entityType: "factory_settings",
    entityId: factoryId,
    metadata: {
      before: {
        display_name: before.display_name,
        currency_code: before.currency_code,
        timezone: before.timezone,
        normalize_by_capacity: before.normalize_by_capacity,
        normalize_by_width: before.normalize_by_width,
        margin_per_kg: before.margin_per_kg,
        energy_cost_per_kwh: before.energy_cost_per_kwh,
        default_monthly_output_kg: before.default_monthly_output_kg,
      },
      after: {
        display_name: after.display_name,
        currency_code: after.currency_code,
        timezone: after.timezone,
        normalize_by_capacity: after.normalize_by_capacity,
        normalize_by_width: after.normalize_by_width,
        margin_per_kg: after.margin_per_kg,
        energy_cost_per_kwh: after.energy_cost_per_kwh,
        default_monthly_output_kg: after.default_monthly_output_kg,
      },
    },
  }).catch(() => {});

  sendJson(res, 200, { settings: after });
}
