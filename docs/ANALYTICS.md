# ClickHouse analytics (Sprint 26)

Optional analytical store for heavy **KPI trends** and **benchmark** reads. OLTP remains PostgreSQL.

## Local setup

1. Start stack: `docker compose up -d postgres clickhouse`
2. In `.env`:
   - `CLICKHOUSE_ENABLED=true`
   - `USE_CLICKHOUSE_QUERIES=true` (routes trends/benchmark to CH when data exists)
   - `CLICKHOUSE_URL=http://127.0.0.1:8123`
3. `npm run db:migrate` (creates `analytics_sync_log`)
4. Sync: `npm run analytics:sync` or **Integrations → Full sync to ClickHouse**

## ETL

- **Incremental:** after monthly Excel upload and benchmark refresh (fire-and-forget).
- **Manual:** `POST /v1/factories/:factory_id/analytics/sync` — body `{ "full": true }` or `{ "reporting_period_ids": ["…"] }`.
- **CLI all factories:** `npm run analytics:sync`
- **CLI one factory:** `FACTORY_ID=<uuid> npm run analytics:sync`
- **Status:** `GET /v1/factories/:factory_id/analytics/status`

### Nightly cron (02:00 UTC default)

```bash
# Long-running scheduler (docker or host)
npm run analytics:scheduler

# One-shot full sync now
npm run analytics:sync:now
```

Docker (with ClickHouse profile):

```bash
docker compose --profile with-clickhouse up -d analytics-cron clickhouse postgres
```

Env: `ANALYTICS_CRON_HOUR_UTC`, `ANALYTICS_CRON_MINUTE_UTC`, `ANALYTICS_SYNC_CONCURRENCY`.

## Performance tuning

| Variable | Default | Purpose |
|----------|---------|---------|
| `CLICKHOUSE_INSERT_BATCH_SIZE` | 5000 | Chunked JSONEachRow inserts |
| `CLICKHOUSE_MUTATION_WAIT_MS` | 3000 | Wait after DELETE mutations before INSERT |
| `ANALYTICS_SYNC_CONCURRENCY` | 2 | Parallel factory syncs in nightly job |

Queries use `FINAL` on ReplacingMergeTree tables and an optimized trends JOIN.

## E2E test (real ClickHouse)

```bash
docker compose up -d postgres clickhouse
npm run db:migrate
# seed / demo data with KPI rows
CLICKHOUSE_ENABLED=true npm run test:analytics:e2e
```

Skips unless `CLICKHOUSE_E2E=1`.

## Production

```bash
docker compose -f docker-compose.prod.yml --profile with-clickhouse up -d
```

Set API env: `CLICKHOUSE_ENABLED`, `USE_CLICKHOUSE_QUERIES`, `CLICKHOUSE_URL=http://clickhouse:8123`.

Readiness `/health/ready` includes `clickhouse` when enabled.

## Tables (database `filmbench`)

- `kpi_monthly_fact` — monthly KPI time series
- `benchmark_fact` — benchmark comparison rows (denormalized)

Schema: `clickhouse/init/01_schema.sql` and `packages/analytics/src/schema.ts`.
