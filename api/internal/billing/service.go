package billing

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type BillingService struct {
	db *pgxpool.Pool
}

type Plan struct {
	ID                 string    `json:"id"`
	Name               string    `json:"name"`
	Description        string    `json:"description"`
	Price              float64   `json:"price"` // in cents
	PriceCents         int       `json:"price_cents"`
	Interval           string    `json:"interval"` // monthly, yearly
	EventLimit         int64     `json:"event_limit"`
	SiteLimit          int       `json:"site_limit"`
	TrackingOrderLimit int64     `json:"tracking_order_limit"`
	Features           []string  `json:"features"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

func (p *Plan) HasFeature(feature string) bool {
	if p == nil {
		return false
	}
	for _, f := range p.Features {
		if f == feature {
			return true
		}
	}
	return false
}

type Subscription struct {
	ID                   string    `json:"id"`
	UserID               string    `json:"user_id"`
	PlanID               string    `json:"plan_id"`
	Status               string    `json:"status"` // active, cancelled, past_due
	CurrentPeriodStart   time.Time `json:"current_period_start"`
	CurrentPeriodEnd     time.Time `json:"current_period_end"`
	StripeSubscriptionID string    `json:"stripe_subscription_id"`
	CreatedAt            time.Time `json:"created_at"`
	UpdatedAt            time.Time `json:"updated_at"`
}

// Default plans
var Plans = []Plan{
	{
		ID:                 "free",
		Name:               "Free",
		Description:        "For small stores just getting started",
		Price:              0,
		PriceCents:         0,
		Interval:           "monthly",
		EventLimit:         10000,
		SiteLimit:          5,
		TrackingOrderLimit: 1000,
		Features:           []string{"basic_analytics", "all_analytics", "email_support", "priority_support", "api_access", "realtime", "order_tracking_api"},
	},
	{
		ID:                 "starter",
		Name:               "Starter",
		Description:        "For growing WooCommerce stores",
		Price:              2900,
		PriceCents:         2900,
		Interval:           "monthly",
		EventLimit:         100000,
		SiteLimit:          3,
		TrackingOrderLimit: 5000,
		Features:           []string{"basic_analytics", "all_analytics", "email_support", "order_tracking_api"},
	},
	{
		ID:                 "pro",
		Name:               "Pro",
		Description:        "For established stores with high traffic",
		Price:              9900,
		PriceCents:         9900,
		Interval:           "monthly",
		EventLimit:         1000000,
		SiteLimit:          10,
		TrackingOrderLimit: 50000,
		Features:           []string{"basic_analytics", "all_analytics", "email_support", "priority_support", "api_access", "realtime", "order_tracking_api"},
	},
	{
		ID:                 "business",
		Name:               "Business",
		Description:        "For multi-store teams with higher volume and support needs",
		Price:              29900,
		PriceCents:         29900,
		Interval:           "monthly",
		EventLimit:         5000000,
		SiteLimit:          50,
		TrackingOrderLimit: 250000,
		Features:           []string{"basic_analytics", "all_analytics", "email_support", "priority_support", "api_access", "realtime", "order_tracking_api"},
	},
}

func NewBillingService() *BillingService {
	return &BillingService{}
}

func NewBillingServiceWithDB(db *pgxpool.Pool) *BillingService {
	return &BillingService{db: db}
}

// GetPlans returns available subscription plans
func (s *BillingService) GetPlans() []Plan {
	if s.db != nil {
		plans, err := s.GetAllPlans(context.Background())
		if err == nil {
			return plans
		}
	}
	return Plans
}

func (s *BillingService) GetAllPlans(ctx context.Context) ([]Plan, error) {
	if s.db == nil {
		return Plans, nil
	}
	rows, err := s.db.Query(ctx, `
		SELECT id, name, COALESCE(description, ''), price_cents, interval, event_limit, site_limit, tracking_order_limit, features, created_at, updated_at
		FROM plans
		ORDER BY price_cents ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var plans []Plan
	for rows.Next() {
		var p Plan
		var featuresJSON []byte
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.PriceCents, &p.Interval, &p.EventLimit, &p.SiteLimit, &p.TrackingOrderLimit, &featuresJSON, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		p.Price = float64(p.PriceCents)
		_ = json.Unmarshal(featuresJSON, &p.Features)
		plans = append(plans, p)
	}
	return plans, rows.Err()
}

// GetSubscription returns user's active subscription
func (s *BillingService) GetSubscription(ctx context.Context, userID string) (*Subscription, error) {
	if s.db != nil {
		var sub Subscription
		err := s.db.QueryRow(ctx, `
			SELECT id, user_id, plan_id, status, current_period_start, current_period_end,
			       COALESCE(stripe_subscription_id, ''), created_at, updated_at
			FROM subscriptions
			WHERE user_id = $1
		`, userID).Scan(
			&sub.ID, &sub.UserID, &sub.PlanID, &sub.Status, &sub.CurrentPeriodStart, &sub.CurrentPeriodEnd,
			&sub.StripeSubscriptionID, &sub.CreatedAt, &sub.UpdatedAt,
		)
		if err != nil {
			if err == pgx.ErrNoRows {
				if ensureErr := s.EnsureFreeSubscription(ctx, userID); ensureErr != nil {
					return nil, ensureErr
				}
				return s.GetSubscription(ctx, userID)
			}
			return nil, err
		}
		return &sub, nil
	}
	// This would query PostgreSQL
	// For now, return free plan subscription
	return &Subscription{
		ID:                 uuid.New().String(),
		UserID:             userID,
		PlanID:             "free",
		Status:             "active",
		CurrentPeriodStart: time.Now().AddDate(0, -1, 0),
		CurrentPeriodEnd:   time.Now().AddDate(0, 1, 0),
	}, nil
}

func (s *BillingService) EnsureFreeSubscription(ctx context.Context, userID string) error {
	if s.db == nil {
		return nil
	}
	_, err := s.db.Exec(ctx, `
		INSERT INTO subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
		VALUES ($1, 'free', 'active', NOW(), NOW() + INTERVAL '1 month')
		ON CONFLICT (user_id) DO NOTHING
	`, userID)
	return err
}

func (s *BillingService) GetPlanForUser(ctx context.Context, userID string) (*Plan, error) {
	sub, err := s.GetSubscription(ctx, userID)
	if err != nil {
		return nil, err
	}
	return s.GetPlan(ctx, sub.PlanID)
}

func (s *BillingService) GetPlan(ctx context.Context, planID string) (*Plan, error) {
	if s.db == nil {
		for _, p := range Plans {
			if p.ID == planID {
				return &p, nil
			}
		}
		return nil, fmt.Errorf("plan not found")
	}
	var p Plan
	var featuresJSON []byte
	err := s.db.QueryRow(ctx, `
		SELECT id, name, COALESCE(description, ''), price_cents, interval, event_limit, site_limit, tracking_order_limit, features, created_at, updated_at
		FROM plans
		WHERE id = $1
	`, planID).Scan(&p.ID, &p.Name, &p.Description, &p.PriceCents, &p.Interval, &p.EventLimit, &p.SiteLimit, &p.TrackingOrderLimit, &featuresJSON, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	p.Price = float64(p.PriceCents)
	_ = json.Unmarshal(featuresJSON, &p.Features)
	return &p, nil
}

func (s *BillingService) UpdateUserPlan(ctx context.Context, userID, planID string) error {
	if s.db == nil {
		return nil
	}
	_, err := s.db.Exec(ctx, `
		INSERT INTO subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
		VALUES ($1, $2, 'active', NOW(), NOW() + INTERVAL '1 month')
		ON CONFLICT (user_id) DO UPDATE SET
			plan_id = EXCLUDED.plan_id,
			status = 'active',
			current_period_start = EXCLUDED.current_period_start,
			current_period_end = EXCLUDED.current_period_end,
			updated_at = NOW()
	`, userID, planID)
	return err
}

func (s *BillingService) CheckSubscriptionAccess(ctx context.Context, userID string) error {
	sub, err := s.GetSubscription(ctx, userID)
	if err != nil {
		return err
	}
	if sub.Status == "active" || sub.Status == "trialing" {
		return nil
	}
	if sub.CurrentPeriodEnd.AddDate(0, 0, 7).After(time.Now()) {
		return nil
	}
	return fmt.Errorf("subscription expired")
}

// CheckUsage checks if user is within plan limits
func (s *BillingService) CheckUsage(ctx context.Context, userID string, siteCount int64) (bool, string) {
	sub, err := s.GetSubscription(ctx, userID)
	if err != nil {
		return false, "error_checking_usage"
	}

	plan, err := s.GetPlan(ctx, sub.PlanID)
	if err != nil {
		return false, "plan_not_found"
	}
	if int64(siteCount) >= int64(plan.SiteLimit) {
		return false, "site_limit_reached"
	}
	return true, ""
}

// GetUsageStats returns user's current usage
func (s *BillingService) GetUsageStats(ctx context.Context, userID string) (*UsageStats, error) {
	sub, _ := s.GetSubscription(ctx, userID)

	plan, err := s.GetPlan(ctx, sub.PlanID)
	if err != nil {
		return nil, err
	}

	return &UsageStats{
		Plan:        plan,
		SitesUsed:   1,
		EventsUsed:  5000,
		EventsLimit: plan.EventLimit,
		CanUpgrade:  plan.Price > 0,
	}, nil
}

type UsageStats struct {
	Plan        *Plan `json:"plan"`
	SitesUsed   int   `json:"sites_used"`
	EventsUsed  int64 `json:"events_used"`
	EventsLimit int64 `json:"events_limit"`
	CanUpgrade  bool  `json:"can_upgrade"`
}
