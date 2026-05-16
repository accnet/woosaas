ALTER TABLE commerce_order_sync_state
  ADD COLUMN IF NOT EXISTS analytics_purchase_bridge_enabled BOOLEAN NOT NULL DEFAULT TRUE;