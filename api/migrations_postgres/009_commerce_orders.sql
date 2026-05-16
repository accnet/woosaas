-- Commerce order architecture is canonical for WooCommerce and ShopBase.
-- Legacy woo_* tables/views are intentionally dropped; historical Woo data is not preserved.
DROP TABLE IF EXISTS woo_order_items CASCADE;
DROP TABLE IF EXISTS woo_orders CASCADE;
DROP TABLE IF EXISTS woo_order_sync_state CASCADE;
DROP TABLE IF EXISTS woo_order_contacts CASCADE;

ALTER TABLE commerce_orders
  ADD COLUMN IF NOT EXISTS delivery_method TEXT,
  ADD COLUMN IF NOT EXISTS source_platform VARCHAR(30) NOT NULL DEFAULT 'woocommerce',
  ADD COLUMN IF NOT EXISTS external_order_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS checkout_token VARCHAR(255),
  ADD COLUMN IF NOT EXISTS cart_token VARCHAR(255),
  ADD COLUMN IF NOT EXISTS order_status_url TEXT,
  ADD COLUMN IF NOT EXISTS payment_gateway TEXT,
  ADD COLUMN IF NOT EXISTS referring_site TEXT;

ALTER TABLE commerce_order_items
  ADD COLUMN IF NOT EXISTS source_platform VARCHAR(30) NOT NULL DEFAULT 'woocommerce';

ALTER TABLE commerce_orders
  DROP CONSTRAINT IF EXISTS commerce_orders_site_id_woo_order_id_key;

ALTER TABLE commerce_order_items
  DROP CONSTRAINT IF EXISTS commerce_order_items_site_id_woo_order_id_line_item_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_commerce_orders_site_platform_order
  ON commerce_orders(site_id, source_platform, woo_order_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_commerce_order_items_site_platform_order_line
  ON commerce_order_items(site_id, source_platform, woo_order_id, line_item_id);
