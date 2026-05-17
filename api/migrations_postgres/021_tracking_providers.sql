CREATE TABLE IF NOT EXISTS tracking_providers (
    id                  VARCHAR(50) PRIMARY KEY,
    display_name        VARCHAR(100) NOT NULL,
    enabled             BOOLEAN NOT NULL DEFAULT true,
    base_url            TEXT,
    docs_url            TEXT,
    auth_type           VARCHAR(50) NOT NULL DEFAULT 'api_key',
    supports_webhooks   BOOLEAN NOT NULL DEFAULT false,
    supports_refresh    BOOLEAN NOT NULL DEFAULT true,
    supports_register   BOOLEAN NOT NULL DEFAULT true,
    capabilities        JSONB NOT NULL DEFAULT '{}',
    config_schema       JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO tracking_providers (
    id, display_name, enabled, base_url, docs_url, auth_type,
    supports_webhooks, supports_refresh, supports_register, capabilities, config_schema
)
VALUES
    ('17track', '17TRACK', true, NULL, NULL, 'api_key', true, true, true, '{}', '{"fields":["api_key","webhook_secret","account_region"]}'),
    ('aftership', 'AfterShip', true, 'https://api.aftership.com/tracking/2026-01', NULL, 'api_key', true, true, true, '{}', '{"fields":["api_key","webhook_secret"]}'),
    ('trackingmore', 'TrackingMore', true, NULL, NULL, 'api_key', true, true, true, '{}', '{"fields":["api_key","webhook_secret"]}')
ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    enabled = EXCLUDED.enabled,
    base_url = EXCLUDED.base_url,
    docs_url = EXCLUDED.docs_url,
    auth_type = EXCLUDED.auth_type,
    supports_webhooks = EXCLUDED.supports_webhooks,
    supports_refresh = EXCLUDED.supports_refresh,
    supports_register = EXCLUDED.supports_register,
    capabilities = EXCLUDED.capabilities,
    config_schema = EXCLUDED.config_schema,
    updated_at = NOW();
