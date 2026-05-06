package billing

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type BillingService struct {
	// pg driver.Conn would be injected
}

type Plan struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Price       float64   `json:"price"` // in cents
	Interval    string    `json:"interval"` // monthly, yearly
	EventLimit  int64     `json:"event_limit"`
	SiteLimit   int       `json:"site_limit"`
	Features    []string  `json:"features"`
}

type Subscription struct {
	ID             string    `json:"id"`
	UserID         string    `json:"user_id"`
	PlanID         string    `json:"plan_id"`
	Status         string    `json:"status"` // active, cancelled, past_due
	CurrentPeriodStart time.Time `json:"current_period_start"`
	CurrentPeriodEnd   time.Time `json:"current_period_end"`
	StripeSubscriptionID string `json:"stripe_subscription_id"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// Default plans
var Plans = []Plan{
	{
		ID:          "free",
		Name:        "Free",
		Description: "For small stores just getting started",
		Price:       0,
		Interval:    "monthly",
		EventLimit:  10000,
		SiteLimit:   1,
		Features:    []string{"basic_analytics", "1_site"},
	},
	{
		ID:          "starter",
		Name:        "Starter",
		Description: "For growing WooCommerce stores",
		Price:       2900, // $29/month
		Interval:    "monthly",
		EventLimit:  100000,
		SiteLimit:   3,
		Features:    []string{"all_analytics", "3_sites", "email_support"},
	},
	{
		ID:          "pro",
		Name:        "Pro",
		Description: "For established stores with high traffic",
		Price:       9900, // $99/month
		Interval:    "monthly",
		EventLimit:  1000000,
		SiteLimit:   10,
		Features:    []string{"all_analytics", "10_sites", "priority_support", "api_access"},
	},
}

func NewBillingService() *BillingService {
	return &BillingService{}
}

// GetPlans returns available subscription plans
func (s *BillingService) GetPlans() []Plan {
	return Plans
}

// GetSubscription returns user's active subscription
func (s *BillingService) GetSubscription(ctx context.Context, userID string) (*Subscription, error) {
	// This would query PostgreSQL
	// For now, return free plan subscription
	return &Subscription{
		ID:             uuid.New().String(),
		UserID:         userID,
		PlanID:         "free",
		Status:         "active",
		CurrentPeriodStart: time.Now().AddDate(0, -1, 0),
		CurrentPeriodEnd:   time.Now().AddDate(0, 1, 0),
	}, nil
}

// CheckUsage checks if user is within plan limits
func (s *BillingService) CheckUsage(ctx context.Context, userID string, siteCount int64) (bool, string) {
	sub, err := s.GetSubscription(ctx, userID)
	if err != nil {
		return false, "error_checking_usage"
	}

	for _, plan := range Plans {
		if plan.ID == sub.PlanID {
			if int64(siteCount) >= int64(plan.SiteLimit) {
				return false, "site_limit_reached"
			}
			return true, ""
		}
	}

	return true, ""
}

// GetUsageStats returns user's current usage
func (s *BillingService) GetUsageStats(ctx context.Context, userID string) (*UsageStats, error) {
	sub, _ := s.GetSubscription(ctx, userID)
	
	var plan *Plan
	for _, p := range Plans {
		if p.ID == sub.PlanID {
			plan = &p
			break
		}
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