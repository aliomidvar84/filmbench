-- Sprint 9 — data quality API: list validation issues by factory (time-ordered reads)
CREATE INDEX IF NOT EXISTS idx_validation_issues_created_desc ON data_validation_issues (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pf_monthly_ingestion_batch ON production_fact_monthly (ingestion_batch_id)
WHERE
  ingestion_batch_id IS NOT NULL;
