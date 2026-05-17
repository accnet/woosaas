CREATE TABLE IF NOT EXISTS users_members (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   TEXT,
    full_name       VARCHAR(255),
    role            VARCHAR(30) NOT NULL DEFAULT 'member',
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    last_login_at   TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (role IN ('owner', 'admin', 'member', 'billing', 'viewer')),
    CHECK (status IN ('active', 'disabled', 'invited'))
);

CREATE INDEX IF NOT EXISTS idx_users_members_user_id ON users_members(user_id);
CREATE INDEX IF NOT EXISTS idx_users_members_email_lower ON users_members(LOWER(email));

INSERT INTO users_members (user_id, email, password_hash, full_name, role, status, created_at, updated_at)
SELECT u.id, u.email, u.password_hash, u.name, 'owner', 'active', u.created_at, u.updated_at
FROM users u
WHERE u.deleted_at IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM users_members um
      WHERE um.user_id = u.id OR LOWER(um.email) = LOWER(u.email)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_members_email_lower_unique ON users_members(LOWER(email));
