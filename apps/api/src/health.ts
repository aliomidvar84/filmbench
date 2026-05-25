import type {
  AppEnvironment,
  DatabaseHealthStatus,
  HealthPayload,
} from "@filmbench/shared";

import { isClickHouseEnabled, pingClickHouse } from "@filmbench/analytics";

import { jwtSecret } from "./config.js";
import { getPool } from "./db.js";

export function isAuthConfigured(): boolean {
  try {
    jwtSecret();
    return true;
  } catch {
    return false;
  }
}

export async function checkDatabaseHealth(): Promise<DatabaseHealthStatus> {
  const pool = getPool();
  if (!pool) return "unconfigured";
  try {
    await pool.query("SELECT 1");
    return "ok";
  } catch {
    return "error";
  }
}

export function buildHealthPayload(
  environment: AppEnvironment,
  check: HealthPayload["check"] = "ready",
): HealthPayload {
  return {
    ok: true,
    check,
    service: "filmbench-api",
    version: "0.1.0",
    environment,
    database: "unconfigured",
    auth_configured: isAuthConfigured(),
  };
}

export function buildLivenessPayload(environment: AppEnvironment): HealthPayload {
  return {
    ...buildHealthPayload(environment, "live"),
    database: "unconfigured",
    auth_configured: isAuthConfigured(),
  };
}

export async function buildReadinessPayload(
  environment: AppEnvironment,
): Promise<HealthPayload> {
  const database = await checkDatabaseHealth();
  const authConfigured = isAuthConfigured();
  const clickhouse = isClickHouseEnabled() ? await pingClickHouse() : undefined;
  const chOk = !clickhouse || clickhouse === "ok";
  const ok = database === "ok" && authConfigured && chOk;

  return {
    ok,
    check: "ready",
    service: "filmbench-api",
    version: "0.1.0",
    environment,
    database,
    auth_configured: authConfigured,
    ...(clickhouse ? { clickhouse } : {}),
  };
}

/** @deprecated Use buildReadinessPayload */
export async function buildHealthPayloadAsync(
  environment: AppEnvironment,
): Promise<HealthPayload> {
  return buildReadinessPayload(environment);
}
