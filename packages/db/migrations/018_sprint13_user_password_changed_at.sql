-- Sprint 13 — track password changes for account security
ALTER TABLE users
ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
