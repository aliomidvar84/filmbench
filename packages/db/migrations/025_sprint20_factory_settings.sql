-- Sprint 20 — factory profile settings (A1 §8, A4 §8)
CREATE TABLE factory_settings (
  factory_id UUID PRIMARY KEY REFERENCES factories (id) ON DELETE CASCADE,
  display_name TEXT,
  currency_code CHAR(3) NOT NULL DEFAULT 'EUR',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  normalize_by_capacity BOOLEAN NOT NULL DEFAULT FALSE,
  normalize_by_width BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT factory_settings_currency_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT factory_settings_timezone_nonempty CHECK (btrim(timezone) <> '')
);

INSERT INTO factory_settings (factory_id, display_name, currency_code)
SELECT f.id, f.factory_name, 'EUR'
FROM factories f
ON CONFLICT (factory_id) DO NOTHING;
