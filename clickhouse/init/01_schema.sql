-- FilmBench analytics (Sprint 26) — fact tables for trends/benchmark reads
CREATE DATABASE IF NOT EXISTS filmbench;

CREATE TABLE IF NOT EXISTS filmbench.kpi_monthly_fact
(
    factory_id UUID,
    line_id UUID,
    reporting_period_id UUID,
    period_start Date,
    period_end Date,
    label String,
    kpi_code LowCardinality(String),
    kpi_name String,
    definition_unit LowCardinality(String),
    kpi_value Float64,
    calculation_status LowCardinality(String),
    synced_at DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(synced_at)
PARTITION BY toYYYYMM(period_end)
ORDER BY (factory_id, line_id, kpi_code, reporting_period_id);

CREATE TABLE IF NOT EXISTS filmbench.benchmark_fact
(
    factory_id UUID,
    reporting_period_id UUID,
    period_end Date,
    kpi_result_id UUID,
    line_id UUID,
    line_code String,
    line_type LowCardinality(String),
    width_band LowCardinality(String),
    kpi_code LowCardinality(String),
    direction LowCardinality(String),
    current_value Nullable(Float64),
    definition_unit LowCardinality(String),
    cohort_key String,
    stored_cohort_key Nullable(String),
    peer_sample_size UInt32,
    peer_min Nullable(Float64),
    peer_max Nullable(Float64),
    peer_avg Nullable(Float64),
    peer_p10 Nullable(Float64),
    peer_p25 Nullable(Float64),
    peer_p50 Nullable(Float64),
    peer_p75 Nullable(Float64),
    peer_p90 Nullable(Float64),
    best_practice_peer_value Nullable(Float64),
    gap_to_median_signed Nullable(Float64),
    gap_to_best_practice_signed Nullable(Float64),
    comparison_status LowCardinality(String),
    primary_cohort_key Nullable(String),
    cohort_key_used Nullable(String),
    cohort_fallback_used UInt8,
    performance_band LowCardinality(String),
    confidence_score Float32,
    estimated_percentile Nullable(Float32),
    synced_at DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(synced_at)
PARTITION BY toYYYYMM(period_end)
ORDER BY (factory_id, reporting_period_id, kpi_result_id);
