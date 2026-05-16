ALTER TABLE site_integrations
  ADD COLUMN IF NOT EXISTS tracking_api_key_encrypted TEXT;
