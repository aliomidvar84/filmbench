-- Sprint 3 — users, factory memberships, refresh tokens (PRD multi-tenant, Annex A1 §9 RBAC).
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_email_lower_chk CHECK (email = lower(btrim(email))),
  CONSTRAINT users_email_unique UNIQUE (email)
);

CREATE TABLE user_factory_memberships (
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  factory_id UUID NOT NULL REFERENCES factories (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'analyst')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now (),
  PRIMARY KEY (user_id, factory_id)
);

CREATE INDEX idx_memberships_factory ON user_factory_memberships (factory_id);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now ()
);

CREATE UNIQUE INDEX idx_refresh_tokens_token_hash ON refresh_tokens (token_hash)
WHERE
  revoked_at IS NULL;

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id);
