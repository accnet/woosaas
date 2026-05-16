ALTER TABLE export_templates
    DROP CONSTRAINT IF EXISTS export_templates_site_id_fkey;

ALTER TABLE export_templates
    ALTER COLUMN site_id DROP NOT NULL;

DROP INDEX IF EXISTS idx_export_templates_site_default;
DROP INDEX IF EXISTS idx_export_templates_site_id;

WITH ranked AS (
    SELECT
        name,
        description,
        columns,
        is_system,
        ROW_NUMBER() OVER (
            PARTITION BY name, description, columns, is_system
            ORDER BY created_at ASC, id ASC
        ) AS rn
    FROM export_templates
    WHERE site_id IS NOT NULL
),
default_candidate AS (
    SELECT name, description, columns, is_system
    FROM export_templates
    WHERE site_id IS NOT NULL AND is_default = TRUE
    ORDER BY is_system ASC, created_at ASC, id ASC
    LIMIT 1
)
INSERT INTO export_templates (
    id,
    site_id,
    name,
    description,
    columns,
    is_system,
    is_default,
    created_at,
    updated_at
)
SELECT
    uuid_generate_v4(),
    NULL,
    ranked.name,
    ranked.description,
    ranked.columns,
    ranked.is_system,
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM default_candidate
            WHERE default_candidate.name = ranked.name
              AND default_candidate.description = ranked.description
              AND default_candidate.columns = ranked.columns
              AND default_candidate.is_system = ranked.is_system
        ) THEN TRUE
        WHEN NOT EXISTS (SELECT 1 FROM default_candidate)
             AND ranked.is_system = TRUE
             AND ranked.name = 'Default' THEN TRUE
        ELSE FALSE
    END,
    NOW(),
    NOW()
FROM ranked
WHERE ranked.rn = 1
  AND NOT EXISTS (
      SELECT 1
      FROM export_templates existing
      WHERE existing.site_id IS NULL
        AND existing.name = ranked.name
        AND existing.description = ranked.description
        AND existing.columns = ranked.columns
        AND existing.is_system = ranked.is_system
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_export_templates_global_default
    ON export_templates ((1))
    WHERE site_id IS NULL AND is_default = TRUE;

CREATE INDEX IF NOT EXISTS idx_export_templates_global_created_at
    ON export_templates (created_at DESC)
    WHERE site_id IS NULL;