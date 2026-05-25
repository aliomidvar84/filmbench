/**
 * Nightly ClickHouse ETL scheduler (UTC).
 * Env: ANALYTICS_CRON_HOUR_UTC (default 2), ANALYTICS_CRON_MINUTE_UTC (default 0)
 * Requires DATABASE_URL, CLICKHOUSE_ENABLED=true, CLICKHOUSE_URL
 */
import pg from "pg";

import {
  analyticsCronHourUtc,
  analyticsCronMinuteUtc,
  isClickHouseEnabled,
  syncAllFactories,
} from "../packages/analytics/src/index.ts";

function msUntilNextRun(hourUtc: number, minuteUtc: number): number {
  const now = new Date();
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      hourUtc,
      minuteUtc,
      0,
      0,
    ),
  );
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.getTime() - now.getTime();
}

async function runOnce(pool: pg.Pool): Promise<void> {
  console.log(
    JSON.stringify({ level: "info", msg: "analytics_nightly_start", at: new Date().toISOString() }),
  );
  const result = await syncAllFactories(pool);
  console.log(JSON.stringify({ level: "info", msg: "analytics_nightly_done", ...result }));
  if (result.factories_failed > 0) process.exitCode = 1;
}

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
  const hour = analyticsCronHourUtc();
  const minute = analyticsCronMinuteUtc();

  const runNow = process.argv.includes("--now");
  if (runNow) {
    await runOnce(pool);
    await pool.end();
    return;
  }

  console.log(
    JSON.stringify({
      level: "info",
      msg: "analytics_scheduler_started",
      next_run_utc: `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`,
    }),
  );

  const loop = async (): Promise<void> => {
    const wait = msUntilNextRun(hour, minute);
    console.log(
      JSON.stringify({
        level: "info",
        msg: "analytics_scheduler_sleep",
        wait_ms: wait,
      }),
    );
    await new Promise((r) => setTimeout(r, wait));
    try {
      await runOnce(pool);
    } catch (e) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "analytics_nightly_error",
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    }
    void loop();
  };

  void loop();
}

void main();
