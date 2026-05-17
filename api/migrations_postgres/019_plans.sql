CREATE TABLE IF NOT EXISTS plans (
    id                   VARCHAR(50) PRIMARY KEY,
    name                 VARCHAR(100) NOT NULL,
    description          TEXT,
    price_cents          INTEGER NOT NULL DEFAULT 0,
    interval             VARCHAR(20) NOT NULL DEFAULT 'monthly',
    event_limit          BIGINT NOT NULL DEFAULT 10000,
    site_limit           INTEGER NOT NULL DEFAULT 1,
    tracking_order_limit BIGINT NOT NULL DEFAULT 0,
    features             JSONB NOT NULL DEFAULT '[]',
    created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (tracking_order_limit >= -1),
    CHECK (jsonb_typeof(features) = 'array')
);

INSERT INTO plans (id, name, description, price_cents, interval, event_limit, site_limit, tracking_order_limit, features)
VALUES
    ('free', 'Free', 'For small stores just getting started', 0, 'monthly', 10000, 1, 0, '["basic_analytics"]'),
    ('starter', 'Starter', 'For growing WooCommerce stores', 2900, 'monthly', 100000, 3, 5000, '["basic_analytics", "all_analytics", "email_support", "order_tracking_api"]'),
    ('pro', 'Pro', 'For established stores with high traffic', 9900, 'monthly', 1000000, 10, 50000, '["basic_analytics", "all_analytics", "email_support", "priority_support", "api_access", "realtime", "order_tracking_api"]'),
    ('business', 'Business', 'For multi-store teams with higher volume and support needs', 29900, 'monthly', 5000000, 50, 250000, '["basic_analytics", "all_analytics", "email_support", "priority_support", "api_access", "realtime", "order_tracking_api"]')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    price_cents = EXCLUDED.price_cents,
    interval = EXCLUDED.interval,
    event_limit = EXCLUDED.event_limit,
    site_limit = EXCLUDED.site_limit,
    tracking_order_limit = EXCLUDED.tracking_order_limit,
    features = EXCLUDED.features,
    updated_at = NOW();
