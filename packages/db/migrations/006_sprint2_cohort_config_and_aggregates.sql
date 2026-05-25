-- Sprint 2 — cohort config (Annex A5 §2), width cohorts (Annex A3 §10 + A1 filters), peer aggregates (Annex A3 §11, PRD n≥5).
CREATE TABLE benchmark_rule_config (
  key text PRIMARY KEY,
  value_json jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cohort_hierarchy_config (
  id SERIAL PRIMARY KEY,
  level_order INTEGER NOT NULL UNIQUE,
  dimension TEXT NOT NULL,
  bucket_template TEXT,
  description TEXT
);

INSERT INTO cohort_hierarchy_config (level_order, dimension, bucket_template, description)
VALUES
  (1, 'region', 'GLOBAL|<REGION>', 'Primary peer slice by market / geography (fallback GLOBAL).'),
  (2, 'line_type', 'BOPP|BOPET|BOPE', 'Film process family.'),
  (3, 'width_band', 'WIDTH_*', 'Nominal line width bucket for comparable lines (Annex A1 Benchmark filters).');

INSERT INTO benchmark_rule_config (key, value_json, description)
VALUES
  (
    'cohort',
    '{"min_sample_size": 5, "outlier_strategy": "iqr_trimmed", "self_exclusion_default": false}'::jsonb,
    'Privacy + MVP benchmark behaviour (Annex A4 §6.4, Annex A5 §9).'
  ),
  (
    'kpi_thresholds_sample',
    '{
      "OEE": {"weak_lt": 0.70, "median_around": 0.75, "strong_gt": 0.85},
      "SCRAP_RATE": {"strong_lt": 0.03, "median_around": 0.05, "weak_gt": 0.08}
    }'::jsonb,
    'Illustrative executive bands (Annex A2 §10) — product thresholds may move to config-driven UI later.'
  );

CREATE OR REPLACE VIEW vw_line_cohort_keys AS
SELECT
  pl.id AS line_id,
  pl.factory_id,
  f.region AS factory_region,
  CASE
    WHEN f.region IS NULL OR btrim(f.region::text) = '' THEN 'GLOBAL'
    ELSE upper(btrim(f.region::text))
  END AS cohort_region,
  upper(pl.line_type::text) AS line_type,
  pl.width_mm,
  CASE
    WHEN pl.width_mm IS NULL THEN 'WIDTH_UNKNOWN'
    WHEN pl.width_mm < 4000 THEN 'WIDTH_0_3999'
    WHEN pl.width_mm < 8000 THEN 'WIDTH_4000_7999'
    WHEN pl.width_mm < 10500 THEN 'WIDTH_8000_10499'
    ELSE 'WIDTH_10500_PLUS'
  END AS width_band,
  (
    CASE
      WHEN f.region IS NULL OR btrim(f.region::text) = '' THEN 'GLOBAL'
      ELSE upper(btrim(f.region::text))
    END
    || '|'
    || upper(pl.line_type::text)
    || '|'
    || (
      CASE
        WHEN pl.width_mm IS NULL THEN 'WIDTH_UNKNOWN'
        WHEN pl.width_mm < 4000 THEN 'WIDTH_0_3999'
        WHEN pl.width_mm < 8000 THEN 'WIDTH_4000_7999'
        WHEN pl.width_mm < 10500 THEN 'WIDTH_8000_10499'
        ELSE 'WIDTH_10500_PLUS'
      END
    )
  )::text AS cohort_key
FROM production_lines pl
JOIN factories f ON f.id = pl.factory_id;

CREATE TABLE benchmark_aggregates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  reporting_period_id UUID NOT NULL REFERENCES reporting_periods (id) ON DELETE CASCADE,
  kpi_code TEXT NOT NULL REFERENCES kpi_definitions (kpi_code) ON DELETE RESTRICT,
  cohort_key TEXT NOT NULL,
  sample_size INTEGER NOT NULL,
  min_value NUMERIC(24, 10),
  max_value NUMERIC(24, 10),
  avg_value NUMERIC(24, 10),
  stddev_sample NUMERIC(24, 10),
  p10 NUMERIC(24, 10),
  p25 NUMERIC(24, 10),
  p50 NUMERIC(24, 10),
  p75 NUMERIC(24, 10),
  p90 NUMERIC(24, 10),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now (),
  UNIQUE (reporting_period_id, kpi_code, cohort_key)
);

CREATE INDEX idx_benchmark_aggregates_period_kpi ON benchmark_aggregates (reporting_period_id, kpi_code);

CREATE INDEX idx_benchmark_aggregates_cohort ON benchmark_aggregates (cohort_key);
