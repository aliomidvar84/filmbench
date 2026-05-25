-- Sprint 16 — stored executive report artifacts + download audit trail
CREATE TABLE factory_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  factory_id UUID NOT NULL REFERENCES factories (id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  reporting_period_id UUID NOT NULL REFERENCES reporting_periods (id) ON DELETE CASCADE,
  line_id UUID REFERENCES production_lines (id) ON DELETE SET NULL,
  report_kind TEXT NOT NULL DEFAULT 'executive_summary' CHECK (report_kind IN ('executive_summary')),
  title TEXT NOT NULL,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  byte_size BIGINT NOT NULL,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now ()
);

CREATE INDEX idx_factory_reports_factory_created ON factory_reports (factory_id, created_at DESC);
