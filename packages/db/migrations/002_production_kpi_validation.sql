-- FilmBench Sprint 1 — monthly production fact + KPI catalog/results + validation (Annex A3)
CREATE TABLE production_fact_monthly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  line_id UUID NOT NULL REFERENCES production_lines (id) ON DELETE CASCADE,
  reporting_period_id UUID NOT NULL REFERENCES reporting_periods (id) ON DELETE RESTRICT,
  total_input_kg NUMERIC(20, 4),
  total_output_kg NUMERIC(20, 4),
  good_output_kg NUMERIC(20, 4),
  scrap_kg NUMERIC(20, 4),
  rework_kg NUMERIC(20, 4),
  runtime_hours NUMERIC(20, 4),
  planned_downtime_hours NUMERIC(20, 4),
  unplanned_downtime_hours NUMERIC(20, 4),
  total_available_hours NUMERIC(20, 4),
  actual_speed NUMERIC(20, 4),
  design_speed NUMERIC(20, 4),
  total_energy_kwh NUMERIC(22, 6),
  energy_cost_amount NUMERIC(20, 4),
  raw_material_cost_amount NUMERIC(20, 4),
  labor_cost_amount NUMERIC(20, 4),
  overhead_cost_amount NUMERIC(20, 4),
  other_cost_amount NUMERIC(20, 4),
  total_cost_amount NUMERIC(20, 4),
  startup_waste_kg NUMERIC(20, 4),
  line_break_count INTEGER NOT NULL DEFAULT 0,
  defect_count INTEGER NOT NULL DEFAULT 0,
  changeover_count INTEGER NOT NULL DEFAULT 0,
  currency_code CHAR(3) NOT NULL DEFAULT 'EUR',
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('excel', 'api', 'manual')),
  ingestion_batch_id UUID,
  data_quality_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    data_quality_status IN ('pending', 'valid', 'warning', 'invalid')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (line_id, reporting_period_id)
);

CREATE TABLE kpi_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  kpi_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('higher', 'lower')),
  formula_text TEXT,
  description TEXT,
  tier SMALLINT NOT NULL CHECK (tier BETWEEN 1 AND 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE kpi_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  factory_id UUID NOT NULL REFERENCES factories (id) ON DELETE CASCADE,
  line_id UUID NOT NULL REFERENCES production_lines (id) ON DELETE CASCADE,
  reporting_period_id UUID NOT NULL REFERENCES reporting_periods (id) ON DELETE CASCADE,
  kpi_code TEXT NOT NULL REFERENCES kpi_definitions (kpi_code) ON DELETE RESTRICT,
  kpi_value NUMERIC(24, 10),
  kpi_unit TEXT NOT NULL,
  benchmark_cohort_key TEXT,
  calculation_status TEXT NOT NULL DEFAULT 'ok',
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (line_id, reporting_period_id, kpi_code)
);

CREATE TABLE data_validation_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  production_fact_id UUID NOT NULL REFERENCES production_fact_monthly (id) ON DELETE CASCADE,
  issue_code TEXT NOT NULL,
  issue_severity TEXT NOT NULL CHECK (issue_severity IN ('error', 'warning')),
  issue_message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_production_fact_line_period ON production_fact_monthly (line_id, reporting_period_id);

CREATE INDEX idx_kpi_results_line_period ON kpi_results (line_id, reporting_period_id);

CREATE INDEX idx_kpi_results_code_period ON kpi_results (kpi_code, reporting_period_id);

CREATE INDEX idx_validation_fact ON data_validation_issues (production_fact_id);
