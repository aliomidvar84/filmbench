-- Base monthly KPI view (Annex A3 §8) — ratios as DECIMAL (0–1), not display percent.
CREATE OR REPLACE VIEW vw_kpi_base_monthly AS
SELECT
  pf.id AS production_fact_id,
  pl.factory_id,
  pf.line_id,
  pf.reporting_period_id,
  pf.total_input_kg,
  pf.total_output_kg,
  pf.good_output_kg,
  pf.scrap_kg,
  pf.rework_kg,
  pf.runtime_hours,
  pf.planned_downtime_hours,
  pf.unplanned_downtime_hours,
  pf.total_available_hours,
  pf.actual_speed,
  pf.design_speed,
  pf.total_energy_kwh,
  pf.energy_cost_amount,
  pf.raw_material_cost_amount,
  pf.total_cost_amount,
  pf.startup_waste_kg,
  pf.line_break_count,
  (pf.scrap_kg / NULLIF(pf.total_output_kg, 0))::NUMERIC(24, 10) AS scrap_rate,
  (pf.good_output_kg / NULLIF(pf.total_input_kg, 0))::NUMERIC(24, 10) AS yield_rate,
  (pf.total_output_kg / NULLIF(pf.runtime_hours, 0))::NUMERIC(24, 10) AS throughput_kg_h,
  (
    (pf.planned_downtime_hours + pf.unplanned_downtime_hours)
    / NULLIF(pf.total_available_hours, 0)
  )::NUMERIC(24, 10) AS downtime_ratio,
  (pf.runtime_hours / NULLIF(pf.total_available_hours, 0))::NUMERIC(24, 10) AS availability,
  (
    CASE
      WHEN pf.design_speed IS NULL OR pf.design_speed = 0 THEN NULL
      ELSE LEAST(1::NUMERIC, pf.actual_speed / NULLIF(pf.design_speed, 0))
    END
  )::NUMERIC(24, 10) AS performance,
  (pf.good_output_kg / NULLIF(pf.total_output_kg, 0))::NUMERIC(24, 10) AS quality,
  (
    CASE
      WHEN pf.total_available_hours IS NULL
      OR pf.total_available_hours = 0 THEN NULL
      WHEN pf.design_speed IS NULL OR pf.design_speed = 0 THEN NULL
      WHEN pf.runtime_hours IS NULL THEN NULL
      WHEN pf.total_output_kg IS NULL
      OR pf.total_output_kg = 0 THEN NULL
      ELSE (
        (pf.runtime_hours / pf.total_available_hours)
        * LEAST(1::NUMERIC, pf.actual_speed / pf.design_speed)
        * (pf.good_output_kg / pf.total_output_kg)
      )::NUMERIC(24, 10)
    END
  ) AS oee,
  (pf.total_energy_kwh / NULLIF(pf.total_output_kg, 0))::NUMERIC(24, 10) AS energy_per_kg,
  (pf.energy_cost_amount / NULLIF(pf.total_output_kg, 0))::NUMERIC(24, 10) AS energy_cost_per_kg,
  (pf.total_cost_amount / NULLIF(pf.total_output_kg, 0))::NUMERIC(24, 10) AS cost_per_kg,
  (pf.raw_material_cost_amount / NULLIF(pf.total_cost_amount, 0))::NUMERIC(24, 10) AS material_cost_ratio,
  (
    (pf.total_cost_amount - pf.raw_material_cost_amount)
    / NULLIF(pf.total_output_kg, 0)
  )::NUMERIC(24, 10) AS conversion_cost_per_kg,
  (pf.rework_kg / NULLIF(pf.total_output_kg, 0))::NUMERIC(24, 10) AS rework_rate,
  (pf.startup_waste_kg / NULLIF(pf.scrap_kg, 0))::NUMERIC(24, 10) AS startup_waste_ratio,
  (pf.line_break_count::NUMERIC / NULLIF(pf.runtime_hours, 0))::NUMERIC(24, 10) AS break_rate_per_h
FROM production_fact_monthly pf
JOIN production_lines pl ON pl.id = pf.line_id;
