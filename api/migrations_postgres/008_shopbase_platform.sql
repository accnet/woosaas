-- Add platform metadata to sites
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS platform VARCHAR(30) NOT NULL DEFAULT 'woocommerce',
  ADD COLUMN IF NOT EXISTS external_shop_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS platform_domain VARCHAR(255),
  ADD COLUMN IF NOT EXISTS primary_domain VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_sites_platform_external_shop
  ON sites(platform, external_shop_id);

-- Credentials store for platform integrations (encrypted at app layer)
CREATE TABLE IF NOT EXISTS site_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  platform VARCHAR(30) NOT NULL,
  auth_type VARCHAR(30) NOT NULL,
  shop_domain VARCHAR(255) NOT NULL,
  api_key_encrypted TEXT,
  api_password_encrypted TEXT,
  tracking_api_key_encrypted TEXT,
  access_token_encrypted TEXT,
  token_secret_encrypted TEXT,
  webhook_secret_encrypted TEXT,
  scopes TEXT[] DEFAULT '{}',
  status VARCHAR(30) NOT NULL DEFAULT 'connected',
  last_verified_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(site_id, platform)
);

-- Per-site ShopBase sync state
CREATE TABLE IF NOT EXISTS shopbase_sync_state (
  site_id UUID PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
  order_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  checkout_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  customer_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  product_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(30) NOT NULL DEFAULT 'idle',
  last_order_updated_at TIMESTAMPTZ,
  last_customer_updated_at TIMESTAMPTZ,
  last_product_updated_at TIMESTAMPTZ,
  last_webhook_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  backfill_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
