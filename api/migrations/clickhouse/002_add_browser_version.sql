ALTER TABLE woosaas.analytics_events
    ADD COLUMN IF NOT EXISTS browser_version LowCardinality(String) AFTER browser;
