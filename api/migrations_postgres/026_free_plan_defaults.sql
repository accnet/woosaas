UPDATE plans
SET
    price_cents = 0,
    interval = 'monthly',
    event_limit = 10000,
    site_limit = 5,
    tracking_order_limit = 1000,
    features = '["basic_analytics", "all_analytics", "email_support", "priority_support", "api_access", "realtime", "order_tracking_api"]'::jsonb,
    updated_at = NOW()
WHERE id = 'free';
