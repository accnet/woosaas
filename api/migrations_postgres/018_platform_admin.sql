CREATE TABLE IF NOT EXISTS platform_admin_users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    full_name       VARCHAR(255),
    role            VARCHAR(30) NOT NULL DEFAULT 'admin',
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    last_login_at   TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (role IN ('owner', 'admin', 'support', 'billing', 'viewer')),
    CHECK (status IN ('active', 'disabled'))
);

CREATE TABLE IF NOT EXISTS platform_admin_sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id        UUID NOT NULL REFERENCES platform_admin_users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(64) NOT NULL UNIQUE,
    ip_address      INET,
    user_agent      TEXT,
    expires_at      TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at      TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_admin_impersonation_sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id        UUID NOT NULL REFERENCES platform_admin_users(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason          TEXT NOT NULL,
    started_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at        TIMESTAMP WITH TIME ZONE,
    metadata        JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS platform_admin_audit_logs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id            UUID REFERENCES platform_admin_users(id) ON DELETE SET NULL,
    action              VARCHAR(100) NOT NULL,
    target_type         VARCHAR(100) NOT NULL,
    target_id           UUID,
    reason              TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}',
    ip_address          INET,
    user_agent          TEXT,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_admin_sessions_admin_id ON platform_admin_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_platform_admin_sessions_expires_at ON platform_admin_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_platform_admin_impersonation_admin_id ON platform_admin_impersonation_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_platform_admin_impersonation_user_id ON platform_admin_impersonation_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_admin_audit_logs_admin_id ON platform_admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_platform_admin_audit_logs_target ON platform_admin_audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_platform_admin_audit_logs_created_at ON platform_admin_audit_logs(created_at);
