/**
 * Generate insights for demo factory after presentation seed (requires API evaluate logic).
 * Run: npm run db:seed-insights
 */
import { loadRepoEnv } from "@filmbench/shared/load-env";
import pg from "pg";

loadRepoEnv();

const DEMO_FACTORY = "11111111-1111-4111-8111-111111111101";
const LATEST_PERIOD = "22222222-2222-4222-8222-222222222212";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL required");

  const { evaluateInsightRules, persistInsights } = await import(
    "../../../apps/api/src/insights/evaluate.js"
  );

  const pool = new pg.Pool({ connectionString: url });
  try {
    const { insights, executionCounts } = await evaluateInsightRules(
      pool,
      DEMO_FACTORY,
      LATEST_PERIOD,
      null,
    );
    const { inserted, critical_count } = await persistInsights(
      pool,
      DEMO_FACTORY,
      LATEST_PERIOD,
      null,
      insights,
      executionCounts,
    );
    console.log(
      JSON.stringify({
        ok: true,
        factory_id: DEMO_FACTORY,
        reporting_period_id: LATEST_PERIOD,
        inserted,
        critical_count,
      }),
    );
  } finally {
    await pool.end();
  }
}

void main();
