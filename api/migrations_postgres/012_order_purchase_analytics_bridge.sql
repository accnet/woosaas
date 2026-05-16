ALTER TABLE commerce_orders
  ADD COLUMN IF NOT EXISTS analytics_purchase_event_id TEXT,
  ADD COLUMN IF NOT EXISTS analytics_purchase_tracked_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_commerce_orders_site_purchase_tracked
  ON commerce_orders (site_id, analytics_purchase_tracked_at DESC);