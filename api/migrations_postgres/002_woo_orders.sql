CREATE TABLE IF NOT EXISTS commerce_order_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    woo_customer_id TEXT,
    email TEXT,
    phone TEXT,
    first_name TEXT,
    last_name TEXT,
    full_name TEXT,
    company TEXT,
    billing_address_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    shipping_address_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    first_order_id TEXT,
    last_order_id TEXT,
    first_seen_at TIMESTAMP WITH TIME ZONE,
    last_seen_at TIMESTAMP WITH TIME ZONE,
    orders_count INTEGER NOT NULL DEFAULT 0,
    total_spent NUMERIC(18, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_commerce_order_contacts_site_email
    ON commerce_order_contacts (site_id, email)
    WHERE email IS NOT NULL AND email <> '';
CREATE INDEX IF NOT EXISTS idx_commerce_order_contacts_site_phone
    ON commerce_order_contacts (site_id, phone);
CREATE INDEX IF NOT EXISTS idx_commerce_order_contacts_site_customer
    ON commerce_order_contacts (site_id, woo_customer_id);

CREATE TABLE IF NOT EXISTS commerce_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    woo_order_id TEXT NOT NULL,
    woo_customer_id TEXT,
    status TEXT NOT NULL,
    payment_status TEXT,
    fulfillment_status TEXT,
    currency TEXT NOT NULL,
    total_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
    subtotal_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
    shipping_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
    refund_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
    items_count INTEGER NOT NULL DEFAULT 0,
    customer_email TEXT,
    customer_first_name TEXT,
    customer_last_name TEXT,
    customer_phone TEXT,
    billing_company TEXT,
    billing_address_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    shipping_address_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    client_id TEXT,
    session_id TEXT,
    attribution_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    contact_id UUID REFERENCES commerce_order_contacts(id) ON DELETE SET NULL,
    created_at_woo TIMESTAMP WITH TIME ZONE,
    paid_at_woo TIMESTAMP WITH TIME ZONE,
    completed_at_woo TIMESTAMP WITH TIME ZONE,
    modified_at_woo TIMESTAMP WITH TIME ZONE NOT NULL,
    deleted_at_woo TIMESTAMP WITH TIME ZONE,
    raw_order_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    delivery_method TEXT,
    source_platform VARCHAR(30) NOT NULL DEFAULT 'woocommerce',
    external_order_name VARCHAR(100),
    checkout_token VARCHAR(255),
    cart_token VARCHAR(255),
    order_status_url TEXT,
    payment_gateway TEXT,
    referring_site TEXT,
    synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(site_id, source_platform, woo_order_id)
);

CREATE INDEX IF NOT EXISTS idx_commerce_orders_site_created_at_woo
    ON commerce_orders (site_id, created_at_woo DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_orders_site_modified_at_woo
    ON commerce_orders (site_id, modified_at_woo DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_orders_site_contact_id
    ON commerce_orders (site_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_commerce_orders_site_status
    ON commerce_orders (site_id, status);

CREATE TABLE IF NOT EXISTS commerce_order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    woo_order_id TEXT NOT NULL,
    line_item_id TEXT NOT NULL,
    product_id TEXT,
    variation_id TEXT,
    sku TEXT,
    name TEXT,
    quantity INTEGER NOT NULL DEFAULT 0,
    unit_price NUMERIC(18, 2) NOT NULL DEFAULT 0,
    line_subtotal NUMERIC(18, 2) NOT NULL DEFAULT 0,
    line_total NUMERIC(18, 2) NOT NULL DEFAULT 0,
    line_tax NUMERIC(18, 2) NOT NULL DEFAULT 0,
    raw_item_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_platform VARCHAR(30) NOT NULL DEFAULT 'woocommerce',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(site_id, source_platform, woo_order_id, line_item_id)
);

CREATE INDEX IF NOT EXISTS idx_commerce_order_items_site_product
    ON commerce_order_items (site_id, product_id);

CREATE TABLE IF NOT EXISTS commerce_order_sync_state (
    site_id UUID PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
    order_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    contact_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    status TEXT NOT NULL DEFAULT 'idle',
    last_backfill_modified_at TIMESTAMP WITH TIME ZONE,
    last_backfill_order_id TEXT,
    last_realtime_synced_at TIMESTAMP WITH TIME ZONE,
    last_success_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    last_error_at TIMESTAMP WITH TIME ZONE,
    backfill_completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
