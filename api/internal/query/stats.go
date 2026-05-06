package query

import (
	"context"
	"fmt"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
)

type Stats struct {
	ch driver.Conn
}

func NewStats(ch driver.Conn) *Stats {
	return &Stats{ch: ch}
}

// GetOverview returns overview stats for a site
func (s *Stats) GetOverview(ctx context.Context, siteID, from, to, timezone string) (*OverviewStats, error) {
	query := `
		SELECT 
			toInt64(countIf(event_name = 'pageview')) as pageviews,
			toInt64(uniqExact(session_id)) as sessions,
			toInt64(uniqExact(client_id)) as users,
			toInt64(countIf(event_name = 'product_view')) as product_views,
			toInt64(countIf(event_name = 'add_to_cart')) as add_to_carts,
			toInt64(countIf(event_name = 'checkout_start')) as checkouts,
			toInt64(countIf(event_name = 'purchase')) as purchases,
			toFloat64(sumIf(revenue, event_name = 'purchase')) as revenue,
			toInt64(countIf(event_name = 'purchase')) as orders,
			toInt64(uniqExactIf(session_id, event_name = 'purchase')) as converting_sessions
		FROM analytics_events
		WHERE site_id = ?
		  AND event_time >= ?
		  AND event_time <= ?
		  AND bot_score < 70
	`

	var stats OverviewStats
	rows, err := s.ch.Query(ctx, query, siteID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if rows.Next() {
		err := rows.Scan(
			&stats.Pageviews, &stats.Sessions, &stats.Users,
			&stats.ProductViews, &stats.AddToCarts, &stats.Checkouts,
			&stats.Purchases, &stats.Revenue, &stats.Orders, &stats.ConvertingSessions,
		)
		if err != nil {
			return nil, err
		}
	}

	if stats.Sessions > 0 {
		stats.ConversionRate = float64(stats.ConvertingSessions) / float64(stats.Sessions) * 100
	}
	if stats.Orders > 0 {
		stats.AOV = stats.Revenue / float64(stats.Orders)
	}

	return &stats, nil
}

type OverviewStats struct {
	Pageviews          int64   `json:"pageviews"`
	Sessions           int64   `json:"sessions"`
	Users              int64   `json:"users"`
	ProductViews       int64   `json:"product_views"`
	AddToCarts         int64   `json:"add_to_carts"`
	Checkouts          int64   `json:"checkouts"`
	Purchases          int64   `json:"purchases"`
	Revenue            float64 `json:"revenue"`
	Orders             int64   `json:"orders"`
	ConversionRate     float64 `json:"conversion_rate"`
	AOV                float64 `json:"aov"`
	ConvertingSessions int64   `json:"converting_sessions"`
}

// GetTrend returns time series data
func (s *Stats) GetTrend(ctx context.Context, siteID, from, to, timezone, granularity string) ([]TrendPoint, error) {
	var dateFormat string
	switch granularity {
	case "hour":
		dateFormat = "%Y-%m-%d %H:00:00"
	case "day":
		dateFormat = "%Y-%m-%d"
	case "week":
		dateFormat = "%Y-W%V"
	case "month":
		dateFormat = "%Y-%m"
	default:
		dateFormat = "%Y-%m-%d"
	}

	query := fmt.Sprintf(`
		SELECT 
			toDateTime(formatDateTime(event_time, '%s')) as date,
			toInt64(countIf(event_name = 'pageview')) as pageviews,
			toInt64(uniqExact(session_id)) as sessions,
			toInt64(uniqExact(client_id)) as users,
			toInt64(countIf(event_name = 'purchase')) as purchases,
			toFloat64(sumIf(revenue, event_name = 'purchase')) as revenue
		FROM analytics_events
		WHERE site_id = ? AND event_time >= ? AND event_time <= ? AND bot_score < 70
		GROUP BY date ORDER BY date
	`, dateFormat)

	rows, err := s.ch.Query(ctx, query, siteID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var points []TrendPoint
	for rows.Next() {
		var point TrendPoint
		err := rows.Scan(&point.Date, &point.Pageviews, &point.Sessions, &point.Users, &point.Purchases, &point.Revenue)
		if err != nil {
			return nil, err
		}
		points = append(points, point)
	}

	return points, nil
}

type TrendPoint struct {
	Date      time.Time `json:"date"`
	Pageviews int64     `json:"pageviews"`
	Sessions  int64     `json:"sessions"`
	Users     int64     `json:"users"`
	Purchases int64     `json:"purchases"`
	Revenue   float64   `json:"revenue"`
}

// GetSources returns traffic source breakdown
func (s *Stats) GetSources(ctx context.Context, siteID, from, to string) ([]SourceStats, error) {
	query := `
		SELECT ifEmpty(source, 'direct') as source, ifEmpty(medium, '') as medium,
			toInt64(countIf(event_name = 'pageview')) as pageviews,
			toInt64(uniqExact(session_id)) as sessions,
			toInt64(uniqExact(client_id)) as users,
			toInt64(countIf(event_name = 'purchase')) as conversions,
			toFloat64(sumIf(revenue, event_name = 'purchase')) as revenue
		FROM analytics_events
		WHERE site_id = ? AND event_time >= ? AND event_time <= ? AND bot_score < 70
		GROUP BY source, medium ORDER BY sessions DESC LIMIT 50
	`

	rows, err := s.ch.Query(ctx, query, siteID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sources []SourceStats
	for rows.Next() {
		var stat SourceStats
		err := rows.Scan(&stat.Source, &stat.Medium, &stat.Pageviews, &stat.Sessions, &stat.Users, &stat.Conversions, &stat.Revenue)
		if err != nil {
			return nil, err
		}
		if stat.Sessions > 0 {
			stat.ConversionRate = float64(stat.Conversions) / float64(stat.Sessions) * 100
		}
		sources = append(sources, stat)
	}

	return sources, nil
}

type SourceStats struct {
	Source         string  `json:"source"`
	Medium         string  `json:"medium"`
	Pageviews      int64   `json:"pageviews"`
	Sessions       int64   `json:"sessions"`
	Users          int64   `json:"users"`
	Conversions    int64   `json:"conversions"`
	Revenue        float64 `json:"revenue"`
	ConversionRate float64 `json:"conversion_rate"`
}

// GetPages returns top pages by traffic
func (s *Stats) GetPages(ctx context.Context, siteID, from, to string, limit int) ([]PageStats, error) {
	query := `
		SELECT path, toInt64(countIf(event_name = 'pageview')) as pageviews,
			toInt64(uniqExact(session_id)) as sessions,
			toInt64(countIf(event_name = 'product_view')) as product_views
		FROM analytics_events
		WHERE site_id = ? AND event_time >= ? AND event_time <= ? AND path != '' AND bot_score < 70
		GROUP BY path ORDER BY pageviews DESC LIMIT ?
	`

	rows, err := s.ch.Query(ctx, query, siteID, from, to, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var pages []PageStats
	for rows.Next() {
		var page PageStats
		err := rows.Scan(&page.Path, &page.Pageviews, &page.Sessions, &page.ProductViews)
		if err != nil {
			return nil, err
		}
		pages = append(pages, page)
	}

	return pages, nil
}

type PageStats struct {
	Path         string `json:"path"`
	Pageviews    int64  `json:"pageviews"`
	Sessions     int64  `json:"sessions"`
	ProductViews int64  `json:"product_views"`
}

// GetProducts returns product performance stats
func (s *Stats) GetProducts(ctx context.Context, siteID, from, to string, limit int) ([]ProductStats, error) {
	query := `
		SELECT product_id, product_name,
			toInt64(countIf(event_name = 'product_view')) as views,
			toInt64(countIf(event_name = 'add_to_cart')) as add_to_carts,
			toInt64(countIf(event_name = 'purchase')) as purchases,
			toFloat64(sumIf(revenue, event_name = 'purchase')) as revenue,
			toInt64(sumIf(quantity, event_name = 'purchase')) as units_sold
		FROM analytics_events
		WHERE site_id = ? AND event_time >= ? AND event_time <= ? AND product_id != '' AND bot_score < 70
		GROUP BY product_id, product_name ORDER BY revenue DESC LIMIT ?
	`

	rows, err := s.ch.Query(ctx, query, siteID, from, to, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var products []ProductStats
	for rows.Next() {
		var product ProductStats
		err := rows.Scan(&product.ProductID, &product.ProductName, &product.Views, &product.AddToCarts, &product.Purchases, &product.Revenue, &product.UnitsSold)
		if err != nil {
			return nil, err
		}
		if product.Views > 0 {
			product.ConversionRate = float64(product.Purchases) / float64(product.Views) * 100
		}
		products = append(products, product)
	}

	return products, nil
}

type ProductStats struct {
	ProductID      string  `json:"product_id"`
	ProductName    string  `json:"product_name"`
	Views          int64   `json:"views"`
	AddToCarts     int64   `json:"add_to_carts"`
	Purchases      int64   `json:"purchases"`
	Revenue        float64 `json:"revenue"`
	UnitsSold      int64   `json:"units_sold"`
	ConversionRate float64 `json:"conversion_rate"`
}

// GetFunnel returns funnel conversion data
func (s *Stats) GetFunnel(ctx context.Context, siteID, from, to string) (*FunnelStats, error) {
	query := `
		SELECT toInt64(sum(is_pageview)) as pageviews, toInt64(sum(is_product_view)) as product_views,
			toInt64(sum(is_add_to_cart)) as add_to_carts, toInt64(sum(is_checkout)) as checkouts, toInt64(sum(is_purchase)) as purchases
		FROM (
			SELECT session_id,
				maxIf(1, event_name = 'pageview') as is_pageview,
				maxIf(1, event_name = 'product_view') as is_product_view,
				maxIf(1, event_name = 'add_to_cart') as is_add_to_cart,
				maxIf(1, event_name = 'checkout_start') as is_checkout,
				maxIf(1, event_name = 'purchase') as is_purchase
			FROM analytics_events
			WHERE site_id = ? AND event_time >= ? AND event_time <= ? AND bot_score < 70
			GROUP BY session_id
		)
	`

	var funnel FunnelStats
	rows, err := s.ch.Query(ctx, query, siteID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if rows.Next() {
		err := rows.Scan(&funnel.Pageviews, &funnel.ProductViews, &funnel.AddToCarts, &funnel.Checkouts, &funnel.Purchases)
		if err != nil {
			return nil, err
		}
	}

	funnel.CalculateRates()
	return &funnel, nil
}

type FunnelStats struct {
	Pageviews       int64   `json:"pageviews"`
	ProductViews    int64   `json:"product_views"`
	AddToCarts      int64   `json:"add_to_carts"`
	Checkouts       int64   `json:"checkouts"`
	Purchases       int64   `json:"purchases"`
	ProductViewRate float64 `json:"product_view_rate"`
	AddToCartRate   float64 `json:"add_to_cart_rate"`
	CheckoutRate    float64 `json:"checkout_rate"`
	PurchaseRate    float64 `json:"purchase_rate"`
}

func (f *FunnelStats) CalculateRates() {
	if f.Pageviews > 0 {
		f.ProductViewRate = float64(f.ProductViews) / float64(f.Pageviews) * 100
	}
	if f.ProductViews > 0 {
		f.AddToCartRate = float64(f.AddToCarts) / float64(f.ProductViews) * 100
	}
	if f.AddToCarts > 0 {
		f.CheckoutRate = float64(f.Checkouts) / float64(f.AddToCarts) * 100
	}
	if f.Checkouts > 0 {
		f.PurchaseRate = float64(f.Purchases) / float64(f.Checkouts) * 100
	}
}
