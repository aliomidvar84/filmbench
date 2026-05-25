-- Sprint 4 — soft validation rows for facts tied to an ingestion batch (after hard KPI refresh)
CREATE OR REPLACE FUNCTION append_soft_validation_for_batch (p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM data_validation_issues d
  WHERE
    d.issue_code = 'SOFT_HIGH_ENERGY_PER_KG'
    AND d.production_fact_id IN (
      SELECT
        pf.id
      FROM
        production_fact_monthly pf
      WHERE
        pf.ingestion_batch_id = p_batch_id
    );

  INSERT INTO
    data_validation_issues (
      production_fact_id,
      issue_code,
      issue_severity,
      issue_message
    )
  SELECT
    pf.id,
    'SOFT_HIGH_ENERGY_PER_KG',
    'warning',
    'Energy per kg of good output exceeds 25 kWh/kg (soft threshold; check metering or allocation).'
  FROM
    production_fact_monthly pf
  WHERE
    pf.ingestion_batch_id = p_batch_id
    AND pf.good_output_kg IS NOT NULL
    AND pf.good_output_kg > 0
    AND pf.total_energy_kwh IS NOT NULL
    AND (pf.total_energy_kwh / pf.good_output_kg) > 25
    AND NOT EXISTS (
      SELECT
        1
      FROM
        data_validation_issues d
      WHERE
        d.production_fact_id = pf.id
        AND d.issue_severity = 'error'
    );

  UPDATE production_fact_monthly pf
  SET
    data_quality_status = CASE
      WHEN EXISTS (
        SELECT
          1
        FROM
          data_validation_issues d
        WHERE
          d.production_fact_id = pf.id
          AND d.issue_severity = 'error'
      ) THEN
        'invalid'
      WHEN EXISTS (
        SELECT
          1
        FROM
          data_validation_issues d
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
    pf.ingestion_batch_id = p_batch_id;
END;
$$;
