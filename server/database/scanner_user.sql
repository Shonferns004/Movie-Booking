-- Create a scanner user with username/password: 123456 / 123456
-- Run this in Supabase SQL Editor.

INSERT INTO users (id, email, password_hash, display_name, status)
VALUES (
  gen_random_uuid(),
  '123456',
  '$2a$10$LOt0vBbN4lsR5VVKiyXnxOKFyRSjjxqRpNsr7o9UVXRSY6VmIIBuW',
  'Scanner',
  'active'
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  status = 'active';

-- Assign SCANNER role
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u, roles r
WHERE u.email = '123456' AND r.name = 'SCANNER'
ON CONFLICT DO NOTHING;