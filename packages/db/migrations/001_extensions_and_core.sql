-- FilmBench Sprint 1 — core entities (PRD, Annex A3 §2)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE factories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  anonymized_code TEXT NOT NULL UNIQUE,
  factory_name TEXT NOT NULL,
  country_code CHAR(2),
  region TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE production_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  factory_id UUID NOT NULL REFERENCES factories (id) ON DELETE CASCADE,
  line_code TEXT NOT NULL,
  line_type TEXT NOT NULL CHECK (
    line_type IN ('BOPP', 'BOPET', 'BOPE')
  ),
  equipment_manufacturer TEXT,
  equipment_model TEXT,
  width_mm NUMERIC(14, 4),
  annual_capacity_ton NUMERIC(18, 4),
  startup_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (factory_id, line_code)
);

CREATE TABLE reporting_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  period_type TEXT NOT NULL CHECK (
    period_type IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')
  ),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period_type, period_start, period_end)
);

CREATE INDEX idx_production_lines_factory ON production_lines (factory_id);

CREATE INDEX idx_reporting_periods_monthly ON reporting_periods (period_type, period_start);
