-- Sprint 11 — KPI rows below factory target (executive summary / priorities)
CREATE OR REPLACE VIEW vw_kpi_below_factory_target AS
SELECT
  kr.factory_id,
  kr.line_id,
  pl.line_code,
  kr.reporting_period_id,
  kr.kpi_code,
  kd.name AS kpi_name,
  kd.unit AS definition_unit,
  kd.direction,
  kr.kpi_value::text AS current_value,
  t.target_value::text AS target_value,
  CASE
    WHEN kd.direction = 'higher' THEN (kr.kpi_value - t.target_value)::text
    ELSE (t.target_value - kr.kpi_value)::text
  END AS gap_to_target_signed
FROM kpi_results kr
INNER JOIN kpi_definitions kd ON kd.kpi_code = kr.kpi_code
INNER JOIN production_lines pl ON pl.id = kr.line_id
INNER JOIN factory_kpi_targets t
  ON t.factory_id = kr.factory_id AND t.kpi_code = kr.kpi_code
WHERE
  kr.calculation_status = 'ok'
  AND kr.kpi_value IS NOT NULL
  AND (
    (kd.direction = 'higher' AND kr.kpi_value < t.target_value)
    OR (kd.direction = 'lower' AND kr.kpi_value > t.target_value)
  );
