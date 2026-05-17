ALTER TABLE sites ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_sites_deleted_at ON sites(deleted_at) WHERE deleted_at IS NOT NULL;
