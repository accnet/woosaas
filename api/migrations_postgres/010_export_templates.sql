CREATE TABLE IF NOT EXISTS export_templates (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id      UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    name         VARCHAR(100) NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    -- Ordered list of column definitions, each: {"type":"order_field"|"custom","key":"...","label":"...","default_value":"..."}
    columns      JSONB NOT NULL DEFAULT '[]',
    is_system    BOOLEAN NOT NULL DEFAULT FALSE,
    is_default   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one default template per site
CREATE UNIQUE INDEX IF NOT EXISTS idx_export_templates_site_default
    ON export_templates (site_id)
    WHERE is_default = TRUE;

CREATE INDEX IF NOT EXISTS idx_export_templates_site_id
    ON export_templates (site_id, created_at DESC);
