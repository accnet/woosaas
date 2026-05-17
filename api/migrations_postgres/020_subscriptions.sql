CREATE TABLE IF NOT EXISTS subscriptions (
    id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    plan_id                VARCHAR(50) NOT NULL DEFAULT 'free' REFERENCES plans(id),
    status                 VARCHAR(20) NOT NULL DEFAULT 'active',
    current_period_start   TIMESTAMP WITH TIME ZONE,
    current_period_end     TIMESTAMP WITH TIME ZONE,
    stripe_customer_id     VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    created_at             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing', 'disabled'))
);

INSERT INTO subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
SELECT id, 'free', 'active', NOW(), NOW() + INTERVAL '1 month'
FROM users
WHERE deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE subscriptions.user_id = users.id);
