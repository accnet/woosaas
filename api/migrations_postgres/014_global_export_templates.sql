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
    FALSE,
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

WITH default_candidate AS (
    SELECT name, description, columns, is_system
    FROM export_templates
    WHERE site_id IS NOT NULL AND is_default = TRUE
    ORDER BY is_system ASC, created_at ASC, id ASC
    LIMIT 1
)
UPDATE export_templates
SET is_default = TRUE, updated_at = NOW()
WHERE id = (
    SELECT t.id
    FROM export_templates t
    LEFT JOIN default_candidate dc ON dc.name = t.name
                                   AND dc.description = t.description
                                   AND dc.columns = t.columns
                                   AND dc.is_system = t.is_system
    WHERE t.site_id IS NULL
    ORDER BY
        (dc.name IS NOT NULL) DESC,
        (t.is_system = TRUE AND t.name = 'Default') DESC,
        t.is_system DESC,
        t.created_at ASC,
        t.id ASC
    LIMIT 1
)
AND NOT EXISTS (
    SELECT 1
    FROM export_templates
    WHERE site_id IS NULL AND is_default = TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_export_templates_global_default
    ON export_templates ((1))
    WHERE site_id IS NULL AND is_default = TRUE;

CREATE INDEX IF NOT EXISTS idx_export_templates_global_created_at
    ON export_templates (created_at DESC)
    WHERE site_id IS NULL;