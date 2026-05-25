-- Sprint 19 — Insight Engine (A6 MVP tables)
CREATE TABLE insight_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  rule_code TEXT NOT NULL,
  rule_group TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  priority_weight NUMERIC(8, 4) NOT NULL DEFAULT 1,
  condition_type TEXT NOT NULL,
  condition_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  title_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  kpi_code_filter TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
  CONSTRAINT insight_rules_rule_code_unique UNIQUE (rule_code)
);

CREATE TABLE generated_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  factory_id UUID NOT NULL REFERENCES factories (id) ON DELETE CASCADE,
  line_id UUID REFERENCES production_lines (id) ON DELETE CASCADE,
  reporting_period_id UUID NOT NULL REFERENCES reporting_periods (id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES insight_rules (id) ON DELETE RESTRICT,
  rule_code TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  priority_score NUMERIC(12, 4) NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  kpi_code TEXT,
  impact_estimate JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now ()
);

CREATE INDEX idx_generated_insights_factory_period_priority ON generated_insights (
  factory_id,
  reporting_period_id,
  priority_score DESC
);

CREATE TABLE insight_rule_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  factory_id UUID NOT NULL REFERENCES factories (id) ON DELETE CASCADE,
  reporting_period_id UUID NOT NULL REFERENCES reporting_periods (id) ON DELETE CASCADE,
  rule_code TEXT NOT NULL,
  matches_found INT NOT NULL DEFAULT 0,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now ()
);

CREATE INDEX idx_insight_rule_executions_factory_period ON insight_rule_executions (
  factory_id,
  reporting_period_id,
  executed_at DESC
);

-- Extend notification kinds for critical insights (Sprint 19)
ALTER TABLE user_notifications
DROP CONSTRAINT IF EXISTS user_notifications_kind_check;

ALTER TABLE user_notifications
ADD CONSTRAINT user_notifications_kind_check CHECK (
  kind IN (
    'ingestion_completed',
    'validation_errors',
    'below_target_alert',
    'password_changed',
    'improvement_action',
    'insight_alert',
    'system'
  )
);
