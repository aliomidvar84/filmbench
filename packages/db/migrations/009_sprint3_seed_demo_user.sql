-- Demo tenant + admin user (development / pilot). Password: ChangeMe123!
INSERT INTO factories (
  id,
  anonymized_code,
  factory_name,
  country_code,
  region,
  is_active
)
VALUES (
  '11111111-1111-4111-8111-111111111101',
  'DEMO-SEED-001',
  'Seed demo factory',
  'DE',
  'EU',
  TRUE
)
ON CONFLICT (anonymized_code) DO NOTHING;

INSERT INTO users (id, email, password_hash, full_name)
VALUES (
  '11111111-1111-4111-8111-111111111102',
  'admin@filmbench.local',
  '$2b$10$6g.U3WJo8TADaWJR5mqXHecH7RiuATVxpBiMsf8RsiNv8/zdpJGCW',
  'Demo Admin'
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO
  user_factory_memberships (user_id, factory_id, role)
SELECT
  u.id,
  f.id,
  'admin'
FROM
  users u
  CROSS JOIN factories f
WHERE
  u.email = 'admin@filmbench.local'
  AND f.id = '11111111-1111-4111-8111-111111111101'
ON CONFLICT (user_id, factory_id) DO NOTHING;
