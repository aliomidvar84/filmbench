-- Sprint 4 — Excel ingestion batches + FK from monthly facts + demo line for seed factory
CREATE TABLE ingestion_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  factory_id UUID NOT NULL REFERENCES factories (id) ON DELETE CASCADE,
  uploaded_by_user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  original_filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'completed', 'failed')
  ),
  row_count INTEGER,
  summary JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_ingestion_batches_factory_created ON ingestion_batches (factory_id, created_at DESC);

ALTER TABLE production_fact_monthly
  ADD CONSTRAINT fk_production_fact_ingestion_batch
  FOREIGN KEY (ingestion_batch_id) REFERENCES ingestion_batches (id) ON DELETE SET NULL;

-- Demo factory (009) — one line so monthly Excel upload can be exercised locally
INSERT INTO
  production_lines (factory_id, line_code, line_type, equipment_manufacturer)
SELECT
  f.id,
  'LINE-A',
  'BOPP',
  'Seed equipment'
FROM
  factories f
WHERE
  f.id = '11111111-1111-4111-8111-111111111101'::uuid
ON CONFLICT (factory_id, line_code) DO NOTHING;
