import {
  clickhouseDatabase,
  clickhouseMutationWaitMs,
  clickhouseInsertBatchSize,
  clickhouseUrl,
  isClickHouseEnabled,
} from "./config.js";

const REQUEST_TIMEOUT_MS = 30_000;

export type ClickHouseHealth = "ok" | "unconfigured" | "error";

export async function pingClickHouse(): Promise<ClickHouseHealth> {
  const base = clickhouseUrl();
  if (!base || !isClickHouseEnabled()) return "unconfigured";
  try {
    const res = await fetch(`${base}/ping`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}

export async function execClickHouse(sql: string): Promise<void> {
  const base = clickhouseUrl();
  if (!base) throw new Error("CLICKHOUSE_URL is not configured");
  const res = await fetch(`${base}/?query=${encodeURIComponent(sql)}`, {
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`clickhouse_exec_failed: ${body.slice(0, 800)}`);
  }
}

export async function queryClickHouseJson<T>(sql: string): Promise<T[]> {
  const base = clickhouseUrl();
  if (!base) throw new Error("CLICKHOUSE_URL is not configured");
  const withFormat = /\bFORMAT\s+JSONEachRow\s*$/i.test(sql)
    ? sql
    : `${sql.trim()}\nFORMAT JSONEachRow`;
  const res = await fetch(`${base}/?query=${encodeURIComponent(withFormat)}`, {
    method: "POST",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`clickhouse_query_failed: ${body.slice(0, 800)}`);
  }
  const text = (await res.text()).trim();
  if (!text) return [];
  return text.split("\n").map((line) => JSON.parse(line) as T);
}

export async function insertJsonEachRow(
  table: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  if (rows.length === 0) return;
  const batchSize = clickhouseInsertBatchSize();
  for (let i = 0; i < rows.length; i += batchSize) {
    await insertJsonEachRowChunk(table, rows.slice(i, i + batchSize));
  }
}

async function insertJsonEachRowChunk(
  table: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  if (rows.length === 0) return;
  const base = clickhouseUrl();
  if (!base) throw new Error("CLICKHOUSE_URL is not configured");
  const db = clickhouseDatabase();
  const fullTable = table.includes(".") ? table : `${db}.${table}`;
  const body = rows.map((r) => JSON.stringify(r)).join("\n");
  const res = await fetch(
    `${base}/?query=${encodeURIComponent(`INSERT INTO ${fullTable} FORMAT JSONEachRow`)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`clickhouse_insert_failed: ${errText.slice(0, 800)}`);
  }
}

/** Wait until pending mutations for a table finish (or timeout). */
export async function waitForClickHouseMutations(
  tableFqn: string,
  timeoutMs = clickhouseMutationWaitMs(),
): Promise<void> {
  if (timeoutMs <= 0) return;
  const db = clickhouseDatabase();
  const table = tableFqn.includes(".") ? tableFqn.split(".")[1] : tableFqn;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pending = await queryClickHouseJson<{ c: string }>(
      `SELECT toString(count()) AS c FROM system.mutations
       WHERE database = '${escapeChString(db)}'
         AND table = '${escapeChString(table)}'
         AND is_done = 0`,
    );
    const count = Number(pending[0]?.c ?? 0);
    if (!count) return;
    await sleep(250);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function escapeChString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
