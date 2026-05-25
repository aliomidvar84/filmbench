-- Sprint 5 — read paths for factory dashboards (filter by factory + period + optional line)
CREATE INDEX IF NOT EXISTS idx_kpi_results_factory_period_line ON kpi_results (
  factory_id,
  reporting_period_id,
  line_id
);
