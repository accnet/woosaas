-- Woosaas ClickHouse Schema - Analytics Events

CREATE DATABASE IF NOT EXISTS woosaas;

CREATE TABLE IF NOT EXISTS woosaas.analytics_events (
    event_date     Date MATERIALIZED toDate(event_time),
    event_time     DateTime64(3),
    received_at    DateTime64(3) DEFAULT now64(3),

    site_id        LowCardinality(String),
    event_id       String,
    event_name     LowCardinality(String),

    client_id      String,
    session_id     String,
    user_id        String,

    url            String,
    path           String,
    referrer       String,

    source         LowCardinality(String),
    medium         LowCardinality(String),
    campaign       String,
    term           String,
    content        String,
    gclid          String,
    fbclid         String,
    ttclid         String,
    msclkid        String,

    device_type    LowCardinality(String),
    browser        LowCardinality(String),
    os             LowCardinality(String),
    country        LowCardinality(String),
    city           String,
    ip_hash        String,
    user_agent     String,

    order_id       String,
    product_id     String,
    product_name   String,
    quantity       UInt32 DEFAULT 0,
    revenue        Decimal(12, 2) DEFAULT 0,
    currency       LowCardinality(String),
    items_json     String,
    properties_json String,

    bot_score      UInt8 DEFAULT 0,
    bot_reason     String,

    INDEX idx_event_id event_id TYPE bloom_filter GRANULARITY 4,
    INDEX idx_session session_id TYPE bloom_filter GRANULARITY 4,
    INDEX idx_client client_id TYPE bloom_filter GRANULARITY 4
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (site_id, event_date, event_name, event_time)
TTL event_date + INTERVAL 12 MONTH DELETE
SETTINGS index_granularity = 8192;

-- Materialized view for daily aggregates (optional for MVP)
-- CREATE MATERIALIZED VIEW IF NOT EXISTS woosaas.daily_overview
-- ENGINE = SummingMergeTree()
-- PARTITION BY toYYYYMM(date)
-- ORDER BY (site_id, date)
-- AS SELECT
--     site_id,
--     toDate(event_time) AS date,
--     countIf(event_name = 'pageview') AS pageviews,
--     uniqExact(session_id) AS sessions,
--     uniqExact(client_id) AS users,
--     countIf(event_name = 'purchase') AS purchases,
--     sumIf(revenue, event_name = 'purchase') AS revenue
-- FROM woosaas.analytics_events
-- WHERE bot_score < 70
-- GROUP BY site_id, toDate(event_time);