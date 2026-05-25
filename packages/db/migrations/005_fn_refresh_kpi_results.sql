-- Hard validation (Annex A3 §14 + Annex A4 §7.1) + idempotent KPI refresh (Annex A3 §9 pattern).
CREATE OR REPLACE FUNCTION refresh_kpi_results (
  p_line_id uuid DEFAULT NULL,
  p_period_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM data_validation_issues d
  USING production_fact_monthly pf
  WHERE d.production_fact_id = pf.id
    AND (p_line_id IS NULL OR pf.line_id = p_line_id)
    AND (p_period_id IS NULL OR pf.reporting_period_id = p_period_id);

  INSERT INTO data_validation_issues (
    production_fact_id,
    issue_code,
    issue_severity,
    issue_message
  )
  SELECT
    pf.id,
    'GOOD_OUTPUT_EXCEEDS_TOTAL',
    'error',
    'good_output_kg must be <= total_output_kg'
  FROM production_fact_monthly pf
  WHERE
    (p_line_id IS NULL OR pf.line_id = p_line_id)
    AND (p_period_id IS NULL OR pf.reporting_period_id = p_period_id)
    AND pf.good_output_kg IS NOT NULL
    AND pf.total_output_kg IS NOT NULL
    AND pf.good_output_kg > pf.total_output_kg;

  INSERT INTO data_validation_issues (
    production_fact_id,
    issue_code,
    issue_severity,
    issue_message
  )
  SELECT
    pf.id,
    'SCRAP_EXCEEDS_OUTPUT',
    'error',
    'scrap_kg must be <= total_output_kg'
  FROM production_fact_monthly pf
  WHERE
    (p_line_id IS NULL OR pf.line_id = p_line_id)
    AND (p_period_id IS NULL OR pf.reporting_period_id = p_period_id)
    AND pf.scrap_kg IS NOT NULL
    AND pf.total_output_kg IS NOT NULL
    AND pf.scrap_kg > pf.total_output_kg;

  INSERT INTO data_validation_issues (
    production_fact_id,
    issue_code,
    issue_severity,
    issue_message
  )
  SELECT
    pf.id,
    'RUNTIME_EXCEEDS_AVAILABLE',
    'error',
    'runtime_hours must be <= total_available_hours'
  FROM production_fact_monthly pf
  WHERE
    (p_line_id IS NULL OR pf.line_id = p_line_id)
    AND (p_period_id IS NULL OR pf.reporting_period_id = p_period_id)
    AND pf.runtime_hours IS NOT NULL
    AND pf.total_available_hours IS NOT NULL
    AND pf.runtime_hours > pf.total_available_hours;

  INSERT INTO data_validation_issues (
    production_fact_id,
    issue_code,
    issue_severity,
    issue_message
  )
  SELECT
    pf.id,
    'COST_BELOW_MATERIAL',
    'error',
    'total_cost_amount must be >= raw_material_cost_amount'
  FROM production_fact_monthly pf
  WHERE
    (p_line_id IS NULL OR pf.line_id = p_line_id)
    AND (p_period_id IS NULL OR pf.reporting_period_id = p_period_id)
    AND pf.total_cost_amount IS NOT NULL
    AND pf.raw_material_cost_amount IS NOT NULL
    AND pf.total_cost_amount < pf.raw_material_cost_amount;

  INSERT INTO data_validation_issues (
    production_fact_id,
    issue_code,
    issue_severity,
    issue_message
  )
  SELECT
    pf.id,
    'NEGATIVE_MEASURE',
    'error',
    'Negative values are not allowed for core production measures'
  FROM production_fact_monthly pf
  WHERE
    (p_line_id IS NULL OR pf.line_id = p_line_id)
    AND (p_period_id IS NULL OR pf.reporting_period_id = p_period_id)
    AND (
      COALESCE(pf.total_input_kg, 0) < 0
      OR COALESCE(pf.total_output_kg, 0) < 0
      OR COALESCE(pf.good_output_kg, 0) < 0
      OR COALESCE(pf.scrap_kg, 0) < 0
      OR COALESCE(pf.rework_kg, 0) < 0
      OR COALESCE(pf.runtime_hours, 0) < 0
      OR COALESCE(pf.planned_downtime_hours, 0) < 0
      OR COALESCE(pf.unplanned_downtime_hours, 0) < 0
      OR COALESCE(pf.total_available_hours, 0) < 0
      OR COALESCE(pf.actual_speed, 0) < 0
      OR COALESCE(pf.design_speed, 0) < 0
      OR COALESCE(pf.total_energy_kwh, 0) < 0
      OR COALESCE(pf.energy_cost_amount, 0) < 0
      OR COALESCE(pf.raw_material_cost_amount, 0) < 0
      OR COALESCE(pf.labor_cost_amount, 0) < 0
      OR COALESCE(pf.overhead_cost_amount, 0) < 0
      OR COALESCE(pf.other_cost_amount, 0) < 0
      OR COALESCE(pf.total_cost_amount, 0) < 0
      OR COALESCE(pf.startup_waste_kg, 0) < 0
      OR COALESCE(pf.line_break_count, 0) < 0
      OR COALESCE(pf.defect_count, 0) < 0
      OR COALESCE(pf.changeover_count, 0) < 0
    );

  UPDATE production_fact_monthly pf
  SET
    data_quality_status = CASE
      WHEN EXISTS (
        SELECT 1
        FROM data_validation_issues d
        WHERE
          d.production_fact_id = pf.id
          AND d.issue_severity = 'error'
      ) THEN
        'invalid'
      WHEN EXISTS (
        SELECT 1
        FROM data_validation_issues d
        WHERE
          d.production_fact_id = pf.id
          AND d.issue_severity = 'warning'
      ) THEN
        'warning'
      ELSE
        'valid'
    END,
    updated_at = now()
  WHERE
    (p_line_id IS NULL OR pf.line_id = p_line_id)
    AND (p_period_id IS NULL OR pf.reporting_period_id = p_period_id);

  DELETE FROM kpi_results kr
  USING production_fact_monthly pf
  WHERE
    kr.line_id = pf.line_id
    AND kr.reporting_period_id = pf.reporting_period_id
    AND (p_line_id IS NULL OR pf.line_id = p_line_id)
    AND (p_period_id IS NULL OR pf.reporting_period_id = p_period_id);

  INSERT INTO kpi_results (
    factory_id,
    line_id,
    reporting_period_id,
    kpi_code,
    kpi_value,
    kpi_unit,
    benchmark_cohort_key,
    calculation_status
  )
  SELECT
    v.factory_id,
    v.line_id,
    v.reporting_period_id,
    t.kpi_code,
    t.kpi_value,
    t.kpi_unit,
    NULL,
    CASE
      WHEN t.kpi_value IS NULL THEN 'null_input'
      ELSE 'ok'
    END
  FROM
    vw_kpi_base_monthly v
    CROSS JOIN LATERAL (
      VALUES
        ('SCRAP_RATE', v.scrap_rate, 'ratio'),
        ('YIELD_RATE', v.yield_rate, 'ratio'),
        ('THROUGHPUT_KG_H', v.throughput_kg_h, 'kg_per_h'),
        ('DOWNTIME_RATIO', v.downtime_ratio, 'ratio'),
        ('AVAILABILITY', v.availability, 'ratio'),
        ('PERFORMANCE', v.performance, 'ratio'),
        ('QUALITY', v.quality, 'ratio'),
        ('OEE', v.oee, 'ratio'),
        ('ENERGY_PER_KG', v.energy_per_kg, 'kwh_per_kg'),
        ('ENERGY_COST_PER_KG', v.energy_cost_per_kg, 'money_per_kg'),
        ('COST_PER_KG', v.cost_per_kg, 'money_per_kg'),
        ('MATERIAL_COST_RATIO', v.material_cost_ratio, 'ratio'),
        ('CONVERSION_COST_PER_KG', v.conversion_cost_per_kg, 'money_per_kg'),
        ('REWORK_RATE', v.rework_rate, 'ratio'),
        ('STARTUP_WASTE_RATIO', v.startup_waste_ratio, 'ratio'),
        ('BREAK_RATE_PER_H', v.break_rate_per_h, 'per_hour')
    ) AS t (kpi_code, kpi_value, kpi_unit)
  WHERE
    v.production_fact_id IN (
      SELECT pf.id
      FROM production_fact_monthly pf
      WHERE
        (p_line_id IS NULL OR pf.line_id = p_line_id)
        AND (p_period_id IS NULL OR pf.reporting_period_id = p_period_id)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM data_validation_issues d
      WHERE
        d.production_fact_id = v.production_fact_id
        AND d.issue_severity = 'error'
    );
END;
$$;
