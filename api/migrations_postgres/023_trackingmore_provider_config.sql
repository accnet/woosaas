ALTER TABLE tracking_providers
    ADD COLUMN IF NOT EXISTS api_key_encrypted TEXT,
    ADD COLUMN IF NOT EXISTS webhook_secret_encrypted TEXT;

UPDATE tracking_providers
SET base_url = COALESCE(NULLIF(base_url, ''), 'https://api.trackingmore.com/v2'),
    docs_url = COALESCE(NULLIF(docs_url, ''), 'https://www.trackingmore.com/docs/trackings/create-a-tracking-item.php?lang=en'),
    supports_webhooks = true,
    supports_register = true,
    supports_refresh = false,
    capabilities = '{"flow":"register_once_webhook_updates","register_endpoint":"POST /trackings/post","webhook_endpoint":"POST /api/v1/shipment-tracking/webhooks/trackingmore"}',
    config_schema = '{"fields":["api_key","webhook_secret","base_url"],"default_base_url":"https://api.trackingmore.com/v2"}',
    updated_at = NOW()
WHERE id = 'trackingmore';
