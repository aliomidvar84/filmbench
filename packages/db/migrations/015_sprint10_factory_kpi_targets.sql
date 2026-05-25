-- Sprint 10 — factory KPI targets (improvement goals vs actuals)
CREATE TABLE factory_kpi_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  factory_id UUID NOT NULL REFERENCES factories (id) ON DELETE CASCADE,
  kpi_code TEXT NOT NULL REFERENCES kpi_definitions (kpi_code) ON DELETE RESTRICT,
  target_value NUMERIC(24, 10) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now (),
  UNIQUE (factory_id, kpi_code)
);

CREATE INDEX idx_factory_kpi_targets_factory ON factory_kpi_targets (factory_id);
