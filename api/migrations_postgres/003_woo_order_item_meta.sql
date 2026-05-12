ALTER TABLE woo_order_items
    ADD COLUMN IF NOT EXISTS external_variant_id TEXT,
    ADD COLUMN IF NOT EXISTS variant_attributes_json JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_woo_order_items_site_ext_variant
    ON woo_order_items (site_id, external_variant_id)
    WHERE external_variant_id IS NOT NULL;
