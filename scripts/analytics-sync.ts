/**
 * CLI: sync all factories (or one) to ClickHouse.
 * Usage: FACTORY_ID=<uuid> npm run analytics:sync
 *        npm run analytics:sync  (all factories)
 * Requires DATABASE_URL and CLICKHOUSE_ENABLED=true in .env
 */
import pg from "pg";

import {
  isClickHouseEnabled,
  syncAllFactories,
  syncFactoryAnalytics,
} from "../packages/analytics/src/index.ts";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  if (!isClickHouseEnabled()) {
    console.error("Set CLICKHOUSE_ENABLED=true");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: url });
  const factoryFilter = process.env.FACTORY_ID?.trim();

  try {
    if (factoryFilter) {
      console.log(`Syncing factory ${factoryFilter}…`);
      const result = await syncFactoryAnalytics(pool, factoryFilter, null);
      console.log(JSON.stringify(result));
      if (!result.ok && !result.skipped) process.exitCode = 1;
    } else {
      const result = await syncAllFactories(pool);
      console.log(JSON.stringify(result));
      if (result.factories_failed > 0) process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

void main();
