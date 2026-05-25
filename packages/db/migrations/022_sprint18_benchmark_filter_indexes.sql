-- Sprint 18 — benchmark explorer filter reads
CREATE INDEX IF NOT EXISTS idx_production_lines_factory_line_type ON production_lines (factory_id, line_type);

CREATE INDEX IF NOT EXISTS idx_kpi_results_factory_period_line ON kpi_results (
  factory_id,
  reporting_period_id,
  line_id
);
