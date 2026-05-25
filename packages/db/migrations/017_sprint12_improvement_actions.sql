-- Sprint 12 — track improvement follow-ups from overview priorities
CREATE TABLE improvement_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  factory_id UUID NOT NULL REFERENCES factories (id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  line_id UUID REFERENCES production_lines (id) ON DELETE SET NULL,
  reporting_period_id UUID REFERENCES reporting_periods (id) ON DELETE SET NULL,
  kpi_code TEXT,
  source_kind TEXT NOT NULL DEFAULT 'manual' CHECK (
    source_kind IN (
      'manual',
      'validation_error',
      'validation_warning',
      'below_target',
      'below_peer_median'
    )
  ),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'in_progress', 'done', 'cancelled')
  ),
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now ()
);

CREATE INDEX idx_improvement_actions_factory_status ON improvement_actions (factory_id, status, updated_at DESC);

CREATE INDEX idx_improvement_actions_factory_period ON improvement_actions (factory_id, reporting_period_id);
