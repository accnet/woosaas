package customer360

import (
	"context"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
)

type CustomerService struct {
	ch driver.Conn
}

type Customer struct {
	ClientID      string    `json:"client_id"`
	SiteID        string    `json:"site_id"`
	Email         string    `json:"email"`
	UserID        string    `json:"user_id"`
	FirstSeen     time.Time `json:"first_seen"`
	LastSeen      time.Time `json:"last_seen"`
	TotalSessions int64     `json:"total_sessions"`
	TotalOrders   int64     `json:"total_orders"`
	TotalRevenue  float64   `json:"total_revenue"`
	AvgOrderValue float64   `json:"avg_order_value"`
	LastSource    string    `json:"last_source"`
	LastMedium    string    `json:"last_medium"`
	LastCampaign  string    `json:"last_campaign"`
	PrimaryDevice string    `json:"primary_device"`
	PrimaryBrowser string   `json:"primary_browser"`
	CustomerType  string    `json:"customer_type"`
	LTV           float64   `json:"ltv"`
}

type CustomerList struct {
	Customers  []Customer `json:"customers"`
	TotalCount int64     `json:"total_count"`
	Page       int       `json:"page"`
	PageSize   int       `json:"page_size"`
}

func (s *CustomerService) GetCustomer(ctx context.Context, siteID, clientID string) (*Customer, error) {
	query := `
		SELECT client_id, argMin(user_id, event_time) as user_id, min(event_time) as first_seen,
			max(event_time) as last_seen, uniqExact(session_id) as total_sessions,
			countIf(event_name = 'purchase') as total_orders,
			sumIf(revenue, event_name = 'purchase') as total_revenue,
			argMin(source, event_time) as last_source, argMin(medium, event_time) as last_medium
		FROM analytics_events
		WHERE site_id = ? AND client_id = ? AND bot_score < 70
		GROUP BY client_id
	`

	var c Customer
	rows, err := s.ch.Query(ctx, query, siteID, clientID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if rows.Next() {
		err := rows.Scan(&c.ClientID, &c.UserID, &c.FirstSeen, &c.LastSeen, &c.TotalSessions, &c.TotalOrders, &c.TotalRevenue, &c.LastSource, &c.LastMedium)
		if err != nil {
			return nil, err
		}
	}

	if c.TotalOrders > 0 {
		c.AvgOrderValue = c.TotalRevenue / float64(c.TotalOrders)
	}
	c.LTV = c.TotalRevenue

	if c.TotalOrders == 0 {
		c.CustomerType = "visitor"
	} else if c.TotalOrders == 1 {
		c.CustomerType = "new_customer"
	} else if c.TotalOrders <= 5 {
		c.CustomerType = "returning"
	} else {
		c.CustomerType = "loyal"
	}

	return &c, nil
}

func (s *CustomerService) ListCustomers(ctx context.Context, siteID string, page, pageSize int) (*CustomerList, error) {
	offset := (page - 1) * pageSize
	query := `
		SELECT client_id, uniqExact(session_id) as total_sessions,
			sumIf(revenue, event_name = 'purchase') as total_revenue,
			countIf(event_name = 'purchase') as total_orders, max(event_time) as last_seen
		FROM analytics_events
		WHERE site_id = ? AND bot_score < 70
		GROUP BY client_id ORDER BY total_revenue DESC LIMIT ? OFFSET ?
	`

	rows, err := s.ch.Query(ctx, query, siteID, pageSize, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var customers []Customer
	for rows.Next() {
		var c Customer
		err := rows.Scan(&c.ClientID, &c.TotalSessions, &c.TotalRevenue, &c.TotalOrders, &c.LastSeen)
		if err != nil {
			continue
		}
		full, _ := s.GetCustomer(ctx, siteID, c.ClientID)
		if full != nil {
			customers = append(customers, *full)
		}
	}

	return &CustomerList{Customers: customers, Page: page, PageSize: pageSize}, nil
}