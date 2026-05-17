ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

UPDATE users
SET email = 'john@woosaas.com',
    name = CASE WHEN name = 'Admin' OR name IS NULL OR name = '' THEN 'John' ELSE name END,
    updated_at = NOW()
WHERE email = 'admin@woosaas.com'
  AND NOT EXISTS (SELECT 1 FROM users WHERE email = 'john@woosaas.com');

CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL;
