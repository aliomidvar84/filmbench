/**
 * Integration test against a real ClickHouse + Postgres.
 * Run: CLICKHOUSE_E2E=1 CLICKHOUSE_ENABLED=true npm test -w @filmbench/analytics
 * Requires: docker compose up -d postgres clickhouse && npm run db:migrate
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pingClickHouse } from "./client.js";
import { isClickHouseEnabled } from "./config.js";
import { syncFactoryAnalytics } from "./sync.js";

const runE2e = process.env.CLICKHOUSE_E2E === "1";

describe.runIf(runE2e)("clickhouse e2e", () => {
  let pool: pg.Pool;
  let factoryId: string | null = null;

  beforeAll(async () => {
    process.env.CLICKHOUSE_ENABLED = "true";
    const url = process.env.DATABASE_URL?.trim();
    if (!url) throw new Error("DATABASE_URL required for CLICKHOUSE_E2E");
    pool = new pg.Pool({ connectionString: url });
    const health = await pingClickHouse();
    expect(health).toBe("ok");

    const { rows } = await pool.query<{ id: string }>(
      `SELECT f.id::text
       FROM factories f
       WHERE EXISTS (
         SELECT 1 FROM kpi_results kr WHERE kr.factory_id = f.id LIMIT 1
       )
       LIMIT 1`,
    );
    factoryId = rows[0]?.id ?? null;
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
  });

  it("syncs at least one factory when KPI data exists", async () => {
    if (!factoryId) {
      console.warn("skip: no factory with kpi_results");
      return;
    }
    const result = await syncFactoryAnalytics(pool, factoryId, null);
    expect(result.ok).toBe(true);
    expect(result.skipped).not.toBe(true);
    if (!isClickHouseEnabled()) return;
    expect(result.kpi_rows_synced).toBeGreaterThanOrEqual(0);
    expect(result.benchmark_rows_synced).toBeGreaterThanOrEqual(0);
  }, 120_000);
});
