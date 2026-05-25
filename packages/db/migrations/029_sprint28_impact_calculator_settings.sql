-- Sprint 28 — impact calculator parameters (A6 §14)
ALTER TABLE factory_settings
  ADD COLUMN IF NOT EXISTS margin_per_kg NUMERIC(18, 4),
  ADD COLUMN IF NOT EXISTS energy_cost_per_kwh NUMERIC(18, 6),
  ADD COLUMN IF NOT EXISTS default_monthly_output_kg NUMERIC(18, 4) NOT NULL DEFAULT 50000;

UPDATE factory_settings
SET
  margin_per_kg = COALESCE(margin_per_kg, 0.85),
  energy_cost_per_kwh = COALESCE(energy_cost_per_kwh, 0.12)
WHERE margin_per_kg IS NULL OR energy_cost_per_kwh IS NULL;
