package customers

import (
	"context"
	"fmt"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
)

type CustomerService struct {
	ch driver.Conn
}

func NewService(ch driver.Conn) *CustomerService {
	return &CustomerService{ch: ch}
}

type Customer struct {
	ClientID       string    `json:"client_id"`
	SiteID         string    `json:"site_id"`
	Email          string    `json:"email"`
	UserID         string    `json:"user_id"`
	FirstSeen      time.Time `json:"first_seen"`
	LastSeen       time.Time `json:"last_seen"`
	TotalSessions  int64     `json:"total_sessions"`
	TotalOrders    int64     `json:"total_orders"`
	TotalRevenue   float64   `json:"total_revenue"`
	AvgOrderValue  float64   `json:"avg_order_value"`
	LastSource     string    `json:"last_source"`
	LastMedium     string    `json:"last_medium"`
	LastCampaign   string    `json:"last_campaign"`
	PrimaryDevice  string    `json:"primary_device"`
	PrimaryBrowser string    `json:"primary_browser"`
	CustomerType   string    `json:"customer_type"`
	LTV            float64   `json:"ltv"`
}

type CustomerEvent struct {
	EventTime   time.Time `json:"event_time"`
	EventName   string    `json:"event_name"`
	SessionID   string    `json:"session_id"`
	Path        string    `json:"path"`
	ProductID   string    `json:"product_id"`
	ProductName string    `json:"product_name"`
	OrderID     string    `json:"order_id"`
	Revenue     float64   `json:"revenue"`
	Currency    string    `json:"currency"`
	Source      string    `json:"source"`
	Medium      string    `json:"medium"`
	Campaign    string    `json:"campaign"`
}

type CustomerDetail struct {
	Customer Customer        `json:"customer"`
	Events   []CustomerEvent `json:"events"`
}

type CustomerList struct {
	Customers  []Customer `json:"customers"`
	TotalCount int64      `json:"total_count"`
	Page       int        `json:"page"`
	PageSize   int        `json:"page_size"`
}

func (s *CustomerService) GetCustomer(ctx context.Context, siteID, clientID string) (*Customer, error) {
	query := `
		SELECT client_id, argMax(user_id, event_time) as user_id, min(event_time) as first_seen,
			max(event_time) as last_seen, toInt64(uniqExact(session_id)) as total_sessions,
			toInt64(countIf(event_name = 'purchase')) as total_orders,
			toFloat64(sumIf(revenue, event_name = 'purchase')) as total_revenue,
			argMax(source, event_time) as last_source,
			argMax(medium, event_time) as last_medium,
			argMax(campaign, event_time) as last_campaign,
			argMax(device_type, event_time) as primary_device,
			argMax(browser, event_time) as primary_browser
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
		err := rows.Scan(
			&c.ClientID,
			&c.UserID,
			&c.FirstSeen,
			&c.LastSeen,
			&c.TotalSessions,
			&c.TotalOrders,
			&c.TotalRevenue,
			&c.LastSource,
			&c.LastMedium,
			&c.LastCampaign,
			&c.PrimaryDevice,
			&c.PrimaryBrowser,
		)
		if err != nil {
			return nil, err
		}
	} else {
		return nil, fmt.Errorf("customer not found")
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
		SELECT client_id, toInt64(uniqExact(session_id)) as total_sessions,
			toFloat64(sumIf(revenue, event_name = 'purchase')) as total_revenue,
			toInt64(countIf(event_name = 'purchase')) as total_orders, max(event_time) as last_seen
		FROM analytics_events
		WHERE site_id = ? AND bot_score < 70
		GROUP BY client_id ORDER BY total_revenue DESC LIMIT ? OFFSET ?
	`

	rows, err := s.ch.Query(ctx, query, siteID, pageSize, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	countRows, err := s.ch.Query(ctx, `
		SELECT toInt64(count())
		FROM (
			SELECT client_id
			FROM analytics_events
			WHERE site_id = ? AND bot_score < 70
			GROUP BY client_id
		)
	`, siteID)
	if err != nil {
		return nil, err
	}
	var totalCount int64
	if countRows.Next() {
		_ = countRows.Scan(&totalCount)
	}
	countRows.Close()

	customers := []Customer{}
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

	return &CustomerList{Customers: customers, TotalCount: totalCount, Page: page, PageSize: pageSize}, nil
}

func (s *CustomerService) GetCustomerDetail(ctx context.Context, siteID, clientID string, limit int) (*CustomerDetail, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	customer, err := s.GetCustomer(ctx, siteID, clientID)
	if err != nil {
		return nil, err
	}
	events, err := s.GetCustomerEvents(ctx, siteID, clientID, limit)
	if err != nil {
		return nil, err
	}
	return &CustomerDetail{Customer: *customer, Events: events}, nil
}

func (s *CustomerService) GetCustomerEvents(ctx context.Context, siteID, clientID string, limit int) ([]CustomerEvent, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	query := `
		SELECT event_time, event_name, session_id, path, product_id, product_name,
			order_id, toFloat64(revenue), currency, source, medium, campaign
		FROM analytics_events
		WHERE site_id = ? AND client_id = ? AND bot_score < 70
		ORDER BY event_time DESC LIMIT ?
	`
	rows, err := s.ch.Query(ctx, query, siteID, clientID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	events := []CustomerEvent{}
	for rows.Next() {
		var event CustomerEvent
		if err := rows.Scan(
			&event.EventTime,
			&event.EventName,
			&event.SessionID,
			&event.Path,
			&event.ProductID,
			&event.ProductName,
			&event.OrderID,
			&event.Revenue,
			&event.Currency,
			&event.Source,
			&event.Medium,
			&event.Campaign,
		); err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, nil
}
