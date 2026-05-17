CREATE TABLE IF NOT EXISTS shipment_trackings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    source_platform VARCHAR(30) NOT NULL DEFAULT 'woocommerce',
    woo_order_id TEXT NOT NULL,
    tracking_number TEXT NOT NULL,
    carrier_slug TEXT,
    carrier_name TEXT,
    provider TEXT NOT NULL DEFAULT 'manual',
    provider_tracking_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    status_raw TEXT,
    tracking_url TEXT,
    last_checkpoint_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ,
    sync_error TEXT,
    wc_push_status TEXT,
    wc_push_error TEXT,
    wc_pushed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shipment_trackings_unique
    ON shipment_trackings (site_id, source_platform, woo_order_id, tracking_number, COALESCE(carrier_slug, ''));

CREATE INDEX IF NOT EXISTS idx_shipment_trackings_order
    ON shipment_trackings (site_id, source_platform, woo_order_id);

CREATE INDEX IF NOT EXISTS idx_shipment_trackings_provider_id
    ON shipment_trackings (provider_tracking_id)
    WHERE provider_tracking_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS shipment_tracking_provider_settings (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'aftership',
    api_key_encrypted TEXT,
    webhook_secret_encrypted TEXT,
    enabled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (provider IN ('aftership', '17track', 'trackingmore')),
    PRIMARY KEY (user_id, provider)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shipment_tracking_one_enabled_provider
    ON shipment_tracking_provider_settings (user_id)
    WHERE enabled = true;

ALTER TABLE sites
    ADD COLUMN IF NOT EXISTS wc_push_url TEXT,
    ADD COLUMN IF NOT EXISTS wc_push_token_encrypted TEXT;
