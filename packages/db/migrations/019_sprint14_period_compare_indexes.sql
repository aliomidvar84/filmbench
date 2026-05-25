-- Sprint 14 — period-over-period reads (line + period_end ordering)
CREATE INDEX IF NOT EXISTS idx_kpi_results_factory_line_period ON kpi_results (
  factory_id,
  line_id,
  reporting_period_id
);
