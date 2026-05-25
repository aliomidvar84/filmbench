-- Sprint 23 — Benchmark A5: entity results, execution log, cohort fallback persist
CREATE TABLE benchmark_execution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  reporting_period_id UUID REFERENCES reporting_periods (id) ON DELETE SET NULL,
  line_id UUID REFERENCES production_lines (id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  entity_rows_written INTEGER NOT NULL DEFAULT 0,
  cohort_fallback_count INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now (),
  finished_at TIMESTAMPTZ NOT NULL DEFAULT now ()
);

CREATE INDEX idx_benchmark_execution_log_started
  ON benchmark_execution_log (started_at DESC);

CREATE TABLE benchmark_entity_results (
  kpi_result_id UUID PRIMARY KEY REFERENCES kpi_results (id) ON DELETE CASCADE,
  factory_id UUID NOT NULL REFERENCES factories (id) ON DELETE CASCADE,
  line_id UUID NOT NULL REFERENCES production_lines (id) ON DELETE CASCADE,
  reporting_period_id UUID NOT NULL REFERENCES reporting_periods (id) ON DELETE CASCADE,
  kpi_code TEXT NOT NULL,
  primary_cohort_key TEXT NOT NULL,
  cohort_key_used TEXT NOT NULL,
  cohort_fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
  peer_sample_size INTEGER,
  comparison_status TEXT NOT NULL,
  performance_band TEXT NOT NULL CHECK (
    performance_band IN ('leader', 'average', 'laggard', 'unknown')
  ),
  confidence_score NUMERIC(6, 4) NOT NULL DEFAULT 0,
  estimated_percentile NUMERIC(6, 2),
  gap_to_median_signed NUMERIC(24, 10),
  gap_to_best_practice_signed NUMERIC(24, 10),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now ()
);

CREATE INDEX idx_benchmark_entity_results_factory_period
  ON benchmark_entity_results (factory_id, reporting_period_id);

CREATE INDEX idx_benchmark_entity_results_band
  ON benchmark_entity_results (factory_id, reporting_period_id, performance_band);

CREATE OR REPLACE FUNCTION refresh_benchmark_entity_results (
  p_line_id uuid DEFAULT NULL,
  p_period_id uuid DEFAULT NULL
)
RETURNS TABLE (rows_written integer, fallback_count integer)
LANGUAGE plpgsql
AS $$
DECLARE
  v_written integer;
  v_fallback integer;
BEGIN
  DELETE FROM benchmark_entity_results ber
  USING kpi_results kr
  WHERE ber.kpi_result_id = kr.id
    AND (p_period_id IS NULL OR kr.reporting_period_id = p_period_id)
    AND (p_line_id IS NULL OR kr.line_id = p_line_id);

  INSERT INTO benchmark_entity_results (
    kpi_result_id,
    factory_id,
    line_id,
    reporting_period_id,
    kpi_code,
    primary_cohort_key,
    cohort_key_used,
    cohort_fallback_used,
    peer_sample_size,
    comparison_status,
    performance_band,
    confidence_score,
    estimated_percentile,
    gap_to_median_signed,
    gap_to_best_practice_signed
  )
  WITH scoped_kr AS (
    SELECT
      kr.id AS kpi_result_id,
      kr.factory_id,
      kr.line_id,
      kr.reporting_period_id,
      kr.kpi_code,
      kr.kpi_value,
      kd.direction,
      ck.cohort_key AS primary_cohort_key,
      ck.cohort_region,
      ck.line_type,
      ck.width_band
    FROM kpi_results kr
    INNER JOIN kpi_definitions kd ON kd.kpi_code = kr.kpi_code
    INNER JOIN vw_line_cohort_keys ck ON ck.line_id = kr.line_id
    WHERE
      kr.calculation_status = 'ok'
      AND kr.kpi_value IS NOT NULL
      AND (p_period_id IS NULL OR kr.reporting_period_id = p_period_id)
      AND (p_line_id IS NULL OR kr.line_id = p_line_id)
  ),
  cohort_candidates AS (
    SELECT
      sk.kpi_result_id,
      sk.factory_id,
      sk.line_id,
      sk.reporting_period_id,
      sk.kpi_code,
      sk.kpi_value,
      sk.direction,
      sk.primary_cohort_key,
      c.candidate_key,
      c.ord
    FROM scoped_kr sk
    CROSS JOIN LATERAL (
      VALUES
        (sk.primary_cohort_key, 1),
        (sk.cohort_region || '|' || sk.line_type || '|WIDTH_UNKNOWN', 2),
        ('GLOBAL|' || sk.line_type || '|' || sk.width_band, 3),
        ('GLOBAL|' || sk.line_type || '|WIDTH_UNKNOWN', 4)
    ) AS c (candidate_key, ord)
  ),
  ranked_match AS (
    SELECT
      cc.kpi_result_id,
      cc.factory_id,
      cc.line_id,
      cc.reporting_period_id,
      cc.kpi_code,
      cc.kpi_value,
      cc.direction,
      cc.primary_cohort_key,
      cc.candidate_key AS cohort_key_used,
      cc.ord,
      ba.sample_size AS peer_sample_size,
      ba.p10,
      ba.p25,
      ba.p50,
      ba.p75,
      ba.p90,
      CASE cc.direction
        WHEN 'higher' THEN ba.p90
        WHEN 'lower' THEN ba.p10
      END AS best_practice_peer_value,
      CASE cc.direction
        WHEN 'higher' THEN cc.kpi_value - ba.p50
        WHEN 'lower' THEN ba.p50 - cc.kpi_value
      END AS gap_to_median_signed,
      CASE cc.direction
        WHEN 'higher' THEN cc.kpi_value - ba.p90
        WHEN 'lower' THEN ba.p10 - cc.kpi_value
      END AS gap_to_best_practice_signed,
      ROW_NUMBER() OVER (
        PARTITION BY cc.kpi_result_id
        ORDER BY
          CASE WHEN ba.sample_size >= 5 THEN 0 ELSE 1 END,
          cc.ord
      ) AS rn
    FROM cohort_candidates cc
    LEFT JOIN benchmark_aggregates ba ON ba.reporting_period_id = cc.reporting_period_id
      AND ba.kpi_code = cc.kpi_code
      AND ba.cohort_key = cc.candidate_key
  ),
  resolved AS (
    SELECT
      rm.kpi_result_id,
      rm.factory_id,
      rm.line_id,
      rm.reporting_period_id,
      rm.kpi_code,
      rm.primary_cohort_key,
      rm.cohort_key_used,
      (rm.cohort_key_used IS DISTINCT FROM rm.primary_cohort_key) AS cohort_fallback_used,
      rm.peer_sample_size,
      CASE
        WHEN rm.peer_sample_size IS NULL OR rm.peer_sample_size < 5 THEN 'insufficient_peer_sample'
        ELSE 'ok'
      END AS comparison_status,
      rm.gap_to_median_signed,
      rm.gap_to_best_practice_signed,
      CASE
        WHEN rm.peer_sample_size IS NULL OR rm.peer_sample_size < 5 THEN 0::numeric
        WHEN rm.peer_sample_size >= 20 THEN LEAST(1.0, 0.9 + (rm.peer_sample_size - 20)::numeric / 200.0)
        WHEN rm.peer_sample_size >= 10 THEN 0.75
        ELSE 0.55
      END AS confidence_score,
      CASE
        WHEN rm.peer_sample_size IS NULL OR rm.peer_sample_size < 5 THEN 'unknown'
        WHEN rm.gap_to_median_signed > 0 AND rm.gap_to_best_practice_signed >= 0 THEN 'leader'
        WHEN rm.gap_to_median_signed < 0 AND rm.gap_to_best_practice_signed < 0 THEN 'laggard'
        ELSE 'average'
      END AS performance_band,
      CASE
        WHEN rm.peer_sample_size IS NULL OR rm.peer_sample_size < 5 THEN NULL::numeric
        WHEN rm.direction = 'higher' AND rm.kpi_value >= rm.p75 THEN 75::numeric
        WHEN rm.direction = 'higher' AND rm.kpi_value >= rm.p50 THEN 55::numeric
        WHEN rm.direction = 'higher' AND rm.kpi_value >= rm.p25 THEN 35::numeric
        WHEN rm.direction = 'lower' AND rm.kpi_value <= rm.p25 THEN 75::numeric
        WHEN rm.direction = 'lower' AND rm.kpi_value <= rm.p50 THEN 55::numeric
        WHEN rm.direction = 'lower' AND rm.kpi_value <= rm.p75 THEN 35::numeric
        ELSE 15::numeric
      END AS estimated_percentile
    FROM ranked_match rm
    WHERE rm.rn = 1
  )
  SELECT
    r.kpi_result_id,
    r.factory_id,
    r.line_id,
    r.reporting_period_id,
    r.kpi_code,
    r.primary_cohort_key,
    r.cohort_key_used,
    r.cohort_fallback_used,
    r.peer_sample_size,
    r.comparison_status,
    r.performance_band,
    r.confidence_score,
    r.estimated_percentile,
    r.gap_to_median_signed,
    r.gap_to_best_practice_signed
  FROM resolved r;

  GET DIAGNOSTICS v_written = ROW_COUNT;

  SELECT count(*)::integer INTO v_fallback
  FROM benchmark_entity_results ber
  INNER JOIN kpi_results kr ON kr.id = ber.kpi_result_id
  WHERE ber.cohort_fallback_used
    AND (p_period_id IS NULL OR kr.reporting_period_id = p_period_id)
    AND (p_line_id IS NULL OR kr.line_id = p_line_id);

  RETURN QUERY SELECT v_written, v_fallback;
END;
$$;

CREATE OR REPLACE FUNCTION refresh_kpis_then_benchmarks (
  p_line_id uuid DEFAULT NULL,
  p_period_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_log_id uuid;
  v_started timestamptz := clock_timestamp();
  v_rows integer;
  v_fallback integer;
  v_duration integer;
BEGIN
  PERFORM refresh_kpi_results(p_line_id, p_period_id);
  PERFORM refresh_benchmark_aggregates(p_period_id);

  INSERT INTO benchmark_execution_log (
    reporting_period_id,
    line_id,
    status,
    started_at
  )
  VALUES (p_period_id, p_line_id, 'success', v_started)
  RETURNING id INTO v_log_id;

  SELECT r.rows_written, r.fallback_count
  INTO v_rows, v_fallback
  FROM refresh_benchmark_entity_results(p_line_id, p_period_id) AS r;

  v_duration := (extract(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::integer;

  UPDATE benchmark_execution_log
  SET
    finished_at = clock_timestamp(),
    entity_rows_written = COALESCE(v_rows, 0),
    cohort_fallback_count = COALESCE(v_fallback, 0),
    duration_ms = v_duration
  WHERE id = v_log_id;
END;
$$;
