CREATE TABLE IF NOT EXISTS system_settings (
    key             VARCHAR(120) PRIMARY KEY,
    value           TEXT NOT NULL DEFAULT '',
    encrypted       BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_settings_updated_at ON system_settings(updated_at);
