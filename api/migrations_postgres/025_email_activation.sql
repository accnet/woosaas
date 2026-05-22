ALTER TABLE users_members ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE users_members DROP CONSTRAINT IF EXISTS users_members_status_check;
ALTER TABLE users_members ADD CONSTRAINT users_members_status_check
    CHECK (status IN ('active', 'disabled', 'invited', 'pending_activation'));

CREATE TABLE IF NOT EXISTS email_activation_tokens (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    member_id   UUID NOT NULL REFERENCES users_members(id) ON DELETE CASCADE,
    token_hash  CHAR(64) NOT NULL UNIQUE,
    expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at     TIMESTAMP WITH TIME ZONE,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_activation_tokens_member_id ON email_activation_tokens(member_id);
CREATE INDEX IF NOT EXISTS idx_email_activation_tokens_expires_at ON email_activation_tokens(expires_at);
