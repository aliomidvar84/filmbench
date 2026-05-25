-- Sprint 26 — ClickHouse ETL sync audit log (Postgres)
CREATE TABLE IF NOT EXISTS analytics_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id UUID NOT NULL REFERENCES factories (id) ON DELETE CASCADE,
  sync_kind TEXT NOT NULL DEFAULT 'full',
  reporting_period_ids UUID[],
  kpi_rows_synced INT NOT NULL DEFAULT 0,
  benchmark_rows_synced INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_analytics_sync_log_factory_started
  ON analytics_sync_log (factory_id, started_at DESC);
