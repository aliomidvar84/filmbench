-- Sprint 8 — append-only audit trail (membership changes, ingestion completion, future hooks)
CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  factory_id UUID NOT NULL REFERENCES factories (id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now ()
);

CREATE INDEX idx_audit_events_factory_created ON audit_events (factory_id, created_at DESC);
