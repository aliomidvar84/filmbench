-- Sprint 15 — in-app notifications (upload, priorities, account security)
CREATE TABLE user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  factory_id UUID REFERENCES factories (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (
    kind IN (
      'ingestion_completed',
      'validation_errors',
      'below_target_alert',
      'password_changed',
      'improvement_action',
      'system'
    )
  ),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  body TEXT,
  href TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now ()
);

CREATE INDEX idx_user_notifications_user_created ON user_notifications (user_id, created_at DESC);

CREATE INDEX idx_user_notifications_user_unread ON user_notifications (user_id, created_at DESC)
WHERE
  read_at IS NULL;
