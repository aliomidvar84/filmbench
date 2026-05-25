-- Presentation / demo sample data (12 months, peer cohort, targets, actions)
-- Idempotent: safe to re-apply peer factories via DELETE; facts use ON CONFLICT upsert.

-- Peer plants for benchmark cohort (sample_size >= 5)
DELETE FROM factories WHERE anonymized_code LIKE 'PRESEED-PEER-%';

INSERT INTO factories (id, anonymized_code, factory_name, country_code, region, is_active)
VALUES
  ('11111111-1111-4111-8111-111111111201', 'PRESEED-PEER-001', 'Peer plant Alpha', 'DE', 'EU', TRUE),
  ('11111111-1111-4111-8111-111111111202', 'PRESEED-PEER-002', 'Peer plant Beta', 'DE', 'EU', TRUE),
  ('11111111-1111-4111-8111-111111111203', 'PRESEED-PEER-003', 'Peer plant Gamma', 'PL', 'EU', TRUE),
  ('11111111-1111-4111-8111-111111111204', 'PRESEED-PEER-004', 'Peer plant Delta', 'IT', 'EU', TRUE),
  ('11111111-1111-4111-8111-111111111205', 'PRESEED-PEER-005', 'Peer plant Epsilon', 'TR', 'EU', TRUE)
ON CONFLICT (anonymized_code) DO NOTHING;

UPDATE factories
SET factory_name = 'Demo Film Plant (presentation)', region = 'EU'
WHERE id = '11111111-1111-4111-8111-111111111101';

INSERT INTO factory_settings (factory_id, display_name, currency_code, margin_per_kg, energy_cost_per_kwh, default_monthly_output_kg)
VALUES (
  '11111111-1111-4111-8111-111111111101',
  'Demo Film Plant',
  'EUR',
  0.92,
  0.14,
  120000
)
ON CONFLICT (factory_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  margin_per_kg = EXCLUDED.margin_per_kg,
  energy_cost_per_kwh = EXCLUDED.energy_cost_per_kwh,
  default_monthly_output_kg = EXCLUDED.default_monthly_output_kg;

-- Lines (same cohort: EU | BOPP | 8000–10499 mm)
UPDATE production_lines
SET
  width_mm = 8200,
  annual_capacity_ton = 18500,
  equipment_model = 'Brückner 8.7m'
WHERE factory_id = '11111111-1111-4111-8111-111111111101'::uuid
  AND line_code = 'LINE-A';

INSERT INTO production_lines (id, factory_id, line_code, line_type, equipment_manufacturer, width_mm, annual_capacity_ton)
VALUES
  ('33333333-3333-4333-8333-333333333302', '11111111-1111-4111-8111-111111111101', 'LINE-B', 'BOPP', 'Brückner', 8400, 16000)
ON CONFLICT (factory_id, line_code) DO UPDATE SET
  width_mm = EXCLUDED.width_mm,
  annual_capacity_ton = EXCLUDED.annual_capacity_ton;

INSERT INTO production_lines (factory_id, line_code, line_type, equipment_manufacturer, width_mm, annual_capacity_ton)
SELECT f.id, 'LINE-1', 'BOPP', 'Dornier', 8100, 17000 + (row_number() OVER (ORDER BY f.anonymized_code)) * 200
FROM factories f
WHERE f.anonymized_code LIKE 'PRESEED-PEER-%'
ON CONFLICT (factory_id, line_code) DO NOTHING;

-- Monthly reporting periods Jun 2025 – May 2026
INSERT INTO reporting_periods (id, period_type, period_start, period_end, label)
VALUES
  ('22222222-2222-4222-8222-222222222201', 'monthly', '2025-06-01', '2025-06-30', 'Jun 2025'),
  ('22222222-2222-4222-8222-222222222202', 'monthly', '2025-07-01', '2025-07-31', 'Jul 2025'),
  ('22222222-2222-4222-8222-222222222203', 'monthly', '2025-08-01', '2025-08-31', 'Aug 2025'),
  ('22222222-2222-4222-8222-222222222204', 'monthly', '2025-09-01', '2025-09-30', 'Sep 2025'),
  ('22222222-2222-4222-8222-222222222205', 'monthly', '2025-10-01', '2025-10-31', 'Oct 2025'),
  ('22222222-2222-4222-8222-222222222206', 'monthly', '2025-11-01', '2025-11-30', 'Nov 2025'),
  ('22222222-2222-4222-8222-222222222207', 'monthly', '2025-12-01', '2025-12-31', 'Dec 2025'),
  ('22222222-2222-4222-8222-222222222208', 'monthly', '2026-01-01', '2026-01-31', 'Jan 2026'),
  ('22222222-2222-4222-8222-222222222209', 'monthly', '2026-02-01', '2026-02-28', 'Feb 2026'),
  ('22222222-2222-4222-8222-222222222210', 'monthly', '2026-03-01', '2026-03-31', 'Mar 2026'),
  ('22222222-2222-4222-8222-222222222211', 'monthly', '2026-04-01', '2026-04-30', 'Apr 2026'),
  ('22222222-2222-4222-8222-222222222212', 'monthly', '2026-05-01', '2026-05-31', 'May 2026')
ON CONFLICT (period_type, period_start, period_end) DO NOTHING;

-- Completed ingestion batch (UI / team history)
INSERT INTO ingestion_batches (
  id,
  factory_id,
  uploaded_by_user_id,
  original_filename,
  storage_path,
  status,
  row_count,
  summary,
  completed_at
)
VALUES (
  '44444444-4444-4444-8444-444444444401',
  '11111111-1111-4111-8111-111111111101',
  '11111111-1111-4111-8111-111111111102',
  'presentation_monthly_2025-2026.xlsx',
  'presentation-seed.xlsx',
  'completed',
  144,
  '{"source":"presentation_seed","months":12,"lines":2}'::jsonb,
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Monthly facts: demo lines trend worse on scrap; peers steadier and better
INSERT INTO production_fact_monthly (
  line_id,
  reporting_period_id,
  total_input_kg,
  total_output_kg,
  good_output_kg,
  scrap_kg,
  rework_kg,
  runtime_hours,
  planned_downtime_hours,
  unplanned_downtime_hours,
  total_available_hours,
  actual_speed,
  design_speed,
  total_energy_kwh,
  energy_cost_amount,
  raw_material_cost_amount,
  labor_cost_amount,
  overhead_cost_amount,
  total_cost_amount,
  startup_waste_kg,
  line_break_count,
  currency_code,
  source_type,
  ingestion_batch_id,
  data_quality_status
)
SELECT
  pl.id AS line_id,
  rp.id AS reporting_period_id,
  v.output_kg * 1.04 AS total_input_kg,
  v.output_kg,
  v.output_kg - v.scrap_kg - v.rework_kg AS good_output_kg,
  v.scrap_kg,
  v.rework_kg,
  v.runtime_h,
  12 AS planned_downtime_hours,
  v.unplanned_h,
  720 AS total_available_hours,
  420 AS actual_speed,
  480 AS design_speed,
  v.output_kg * v.kwh_per_kg AS total_energy_kwh,
  v.output_kg * v.kwh_per_kg * 0.14 AS energy_cost_amount,
  v.output_kg * 0.62 AS raw_material_cost_amount,
  v.output_kg * 0.18 AS labor_cost_amount,
  v.output_kg * 0.08 AS overhead_cost_amount,
  v.output_kg * 0.95 AS total_cost_amount,
  v.scrap_kg * 0.15 AS startup_waste_kg,
  CASE WHEN pl.line_code = 'LINE-A' THEN 3 ELSE 2 END AS line_break_count,
  'EUR',
  'excel',
  '44444444-4444-4444-8444-444444444401'::uuid,
  'valid'
FROM production_lines pl
CROSS JOIN reporting_periods rp
CROSS JOIN LATERAL (
  SELECT
    118000 + (extract(MONTH FROM rp.period_start)::int % 3) * 1500 AS output_kg,
    CASE
      WHEN pl.factory_id = '11111111-1111-4111-8111-111111111101'::uuid
        THEN (0.042 + (row_number() OVER (PARTITION BY pl.id ORDER BY rp.period_start) - 1) * 0.0025)
             * (118000 + (extract(MONTH FROM rp.period_start)::int % 3) * 1500)
      ELSE (0.032 + (pl.line_code::text ~ '.*[24]$')::int * 0.002)
           * (118000 + (extract(MONTH FROM rp.period_start)::int % 3) * 1500)
    END AS scrap_kg,
    800 + (extract(MONTH FROM rp.period_start)::int % 2) * 100 AS rework_kg,
    640 - (extract(MONTH FROM rp.period_start)::int % 4) * 8 AS runtime_h,
    CASE WHEN pl.factory_id = '11111111-1111-4111-8111-111111111101'::uuid THEN 28 ELSE 18 END AS unplanned_h,
    CASE
      WHEN pl.factory_id = '11111111-1111-4111-8111-111111111101'::uuid THEN 1.18 + (row_number() OVER (PARTITION BY pl.id ORDER BY rp.period_start) - 1) * 0.015
      ELSE 0.94 + (abs(hashtext(pl.factory_id::text || rp.id::text)) % 10) * 0.006
    END AS kwh_per_kg
) AS v
WHERE pl.line_type = 'BOPP'
  AND (
    pl.factory_id = '11111111-1111-4111-8111-111111111101'::uuid
    OR pl.factory_id IN (
      SELECT id FROM factories WHERE anonymized_code LIKE 'PRESEED-PEER-%'
    )
  )
  AND rp.id >= '22222222-2222-4222-8222-222222222201'::uuid
  AND rp.id <= '22222222-2222-4222-8222-222222222212'::uuid
ON CONFLICT (line_id, reporting_period_id) DO UPDATE SET
  total_output_kg = EXCLUDED.total_output_kg,
  good_output_kg = EXCLUDED.good_output_kg,
  scrap_kg = EXCLUDED.scrap_kg,
  total_energy_kwh = EXCLUDED.total_energy_kwh,
  data_quality_status = EXCLUDED.data_quality_status,
  updated_at = now();

-- KPI targets (demo factory)
INSERT INTO factory_kpi_targets (factory_id, kpi_code, target_value, notes)
VALUES
  ('11111111-1111-4111-8111-111111111101', 'SCRAP_RATE', 0.040, 'Presentation target ≤ 4%'),
  ('11111111-1111-4111-8111-111111111101', 'OEE', 0.720, 'Stretch goal for monthly close'),
  ('11111111-1111-4111-8111-111111111101', 'ENERGY_PER_KG', 1.050, 'kWh/kg ceiling')
ON CONFLICT (factory_id, kpi_code) DO UPDATE SET
  target_value = EXCLUDED.target_value,
  notes = EXCLUDED.notes,
  updated_at = now();

-- Sample improvement actions
INSERT INTO improvement_actions (
  id,
  factory_id,
  created_by_user_id,
  line_id,
  reporting_period_id,
  kpi_code,
  source_kind,
  title,
  description,
  status,
  due_date
)
SELECT
  '55555555-5555-4555-8555-555555555501',
  '11111111-1111-4111-8111-111111111101',
  '11111111-1111-4111-8111-111111111102',
  pl.id,
  '22222222-2222-4222-8222-222222222212'::uuid,
  'SCRAP_RATE',
  'below_peer_median',
  'Reduce scrap on LINE-A vs EU BOPP peers',
  'Focus on trim width and startup waste; target −1.5 pts vs May benchmark.',
  'in_progress',
  (CURRENT_DATE + 30)
FROM production_lines pl
WHERE pl.factory_id = '11111111-1111-4111-8111-111111111101'::uuid
  AND pl.line_code = 'LINE-A'
ON CONFLICT (id) DO NOTHING;

INSERT INTO improvement_actions (
  id, factory_id, created_by_user_id, kpi_code, source_kind, title, status
)
VALUES
  (
    '55555555-5555-4555-8555-555555555502',
    '11111111-1111-4111-8111-111111111101',
    '11111111-1111-4111-8111-111111111102',
    'ENERGY_PER_KG',
    'below_target',
    'Energy recovery on chill-roll section',
    'open'
  ),
  (
    '55555555-5555-4555-8555-555555555503',
    '11111111-1111-4111-8111-111111111101',
    '11111111-1111-4111-8111-111111111102',
    'OEE',
    'manual',
    'SMED workshop for grade changeovers',
    'done'
  )
ON CONFLICT (id) DO NOTHING;

-- Materialise KPIs + benchmarks
SELECT refresh_kpis_then_benchmarks(NULL::uuid, NULL::uuid);
