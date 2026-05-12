CREATE TABLE IF NOT EXISTS user_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    default_date_range VARCHAR(20) NOT NULL DEFAULT '7d',
    dashboard_density VARCHAR(20) NOT NULL DEFAULT 'comfortable',
    landing_page VARCHAR(20) NOT NULL DEFAULT 'sites',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
