-- Sprint 22 — MES / integration event inbox (append-only stub)
CREATE TABLE integration_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  factory_id UUID NOT NULL REFERENCES factories (id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'mes' CHECK (source IN ('mes')),
  event_type TEXT NOT NULL,
  external_id TEXT,
  line_id UUID REFERENCES production_lines (id) ON DELETE SET NULL,
  line_code TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now (),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now (),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'accepted' CHECK (
    status IN ('accepted', 'rejected', 'processed')
  ),
  rejection_reason TEXT,
  received_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX idx_integration_events_factory_received
  ON integration_events (factory_id, received_at DESC);

CREATE INDEX idx_integration_events_external
  ON integration_events (factory_id, source, external_id)
  WHERE external_id IS NOT NULL;
