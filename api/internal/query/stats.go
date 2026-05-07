package query

import (
	"context"
	"fmt"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/redis/go-redis/v9"
)

type Stats struct {
	ch    driver.Conn
	cache *statsCache
}

func NewStats(ch driver.Conn) *Stats {
	return &Stats{ch: ch}
}

// NewStatsWithCache creates a Stats instance with Redis caching enabled.
func NewStatsWithCache(ch driver.Conn, r *redis.Client) *Stats {
	return &Stats{ch: ch, cache: newStatsCache(r)}
}

// GetOverview returns overview stats. Results are cached for 3 minutes.
func (s *Stats) GetOverview(ctx context.Context, siteID, from, to, timezone string) (*OverviewStats, error) {
	const ttl = 3 * time.Minute
	key := cacheKey("overview", siteID, from, to, timezone)
	var cached OverviewStats
	if s.cache.get(ctx, key, &cached) {
		return &cached, nil
	}

	query := `
		SELECT 
			toInt64(countIf(event_name = 'pageview')) as pageviews,
			toInt64(uniqExact(session_id)) as sessions,
			toInt64(uniqExact(client_id)) as users,
			toInt64(countIf(event_name = 'product_view')) as product_views,
			toInt64(countIf(event_name = 'add_to_cart')) as add_to_carts,
			toInt64(countIf(event_name = 'checkout_start')) as checkouts,
			toInt64(countIf(event_name = 'purchase')) as purchases,
			toFloat64(sumIf(revenue, event_name = 'purchase')) as total_revenue,
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

	s.cache.set(ctx, key, &stats, ttl)
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

// granularityFormats maps granularity strings to ClickHouse date format strings.
// Using a map avoids fmt.Sprintf-into-SQL antipattern (L1).
var granularityFormats = map[string]string{
	"hour":  "%Y-%m-%d %H:00:00",
	"day":   "%Y-%m-%d",
	"week":  "%Y-W%V",
	"month": "%Y-%m",
}

// GetTrend returns time series data. Results are cached for 5 minutes.
func (s *Stats) GetTrend(ctx context.Context, siteID, from, to, timezone, granularity string) ([]TrendPoint, error) {
	const ttl = 5 * time.Minute
	key := cacheKey("trend", siteID, from, to, granularity)
	var cached []TrendPoint
	if s.cache.get(ctx, key, &cached) {
		return cached, nil
	}

	dateFormat, ok := granularityFormats[granularity]
	if !ok {
		dateFormat = granularityFormats["day"]
	}

	query := fmt.Sprintf(`
		SELECT 
			toDateTime(formatDateTime(event_time, '%s')) as date,
			toInt64(countIf(event_name = 'pageview')) as pageviews,
			toInt64(uniqExact(session_id)) as sessions,
			toInt64(uniqExact(client_id)) as users,
			toInt64(countIf(event_name = 'purchase')) as purchases,
			toFloat64(sumIf(revenue, event_name = 'purchase')) as total_revenue
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

	if points != nil {
		s.cache.set(ctx, key, points, ttl)
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

// GetSources returns traffic source breakdown. Results are cached for 5 minutes.
func (s *Stats) GetSources(ctx context.Context, siteID, from, to string) ([]SourceStats, error) {
	const ttl = 5 * time.Minute
	key := cacheKey("sources", siteID, from, to)
	var cached []SourceStats
	if s.cache.get(ctx, key, &cached) {
		return cached, nil
	}

	query := `
		SELECT if(source = '', 'direct', source) as source, if(medium = '', '', medium) as medium,
			toInt64(countIf(event_name = 'pageview')) as pageviews,
			toInt64(uniqExact(session_id)) as sessions,
			toInt64(uniqExact(client_id)) as users,
			toInt64(countIf(event_name = 'purchase')) as conversions,
			toFloat64(sumIf(revenue, event_name = 'purchase')) as total_revenue
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

	if sources != nil {
		s.cache.set(ctx, key, sources, ttl)
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

// GetCampaigns returns campaign-level attribution performance. Cached 5 minutes.
func (s *Stats) GetCampaigns(ctx context.Context, siteID, from, to string) ([]CampaignStats, error) {
	const ttl = 5 * time.Minute
	key := cacheKey("campaigns", siteID, from, to)
	var cached []CampaignStats
	if s.cache.get(ctx, key, &cached) {
		return cached, nil
	}

	query := `
		SELECT
			if(source = '', 'direct', source) as source,
			if(medium = '', '', medium) as medium,
			if(campaign = '', '(none)', campaign) as campaign,
			toInt64(countIf(event_name = 'pageview')) as pageviews,
			toInt64(uniqExact(session_id)) as sessions,
			toInt64(uniqExact(client_id)) as users,
			toInt64(countIf(event_name = 'purchase')) as conversions,
			toFloat64(sumIf(revenue, event_name = 'purchase')) as total_revenue,
			toInt64(countIf(gclid != '')) as gclid_events,
			toInt64(countIf(fbclid != '')) as fbclid_events,
			toInt64(countIf(ttclid != '')) as ttclid_events,
			toInt64(countIf(msclkid != '')) as msclkid_events
		FROM analytics_events
		WHERE site_id = ? AND event_time >= ? AND event_time <= ? AND bot_score < 70
		GROUP BY source, medium, campaign
		ORDER BY total_revenue DESC, sessions DESC
		LIMIT 100
	`

	rows, err := s.ch.Query(ctx, query, siteID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var campaigns []CampaignStats
	for rows.Next() {
		var stat CampaignStats
		if err := rows.Scan(
			&stat.Source,
			&stat.Medium,
			&stat.Campaign,
			&stat.Pageviews,
			&stat.Sessions,
			&stat.Users,
			&stat.Conversions,
			&stat.Revenue,
			&stat.GCLIDEvents,
			&stat.FBCLIDEvents,
			&stat.TTCLIDEvents,
			&stat.MSCLKIDEvents,
		); err != nil {
			return nil, err
		}
		if stat.Sessions > 0 {
			stat.ConversionRate = float64(stat.Conversions) / float64(stat.Sessions) * 100
			stat.RevenuePerSession = stat.Revenue / float64(stat.Sessions)
		}
		campaigns = append(campaigns, stat)
	}

	if campaigns != nil {
		s.cache.set(ctx, key, campaigns, ttl)
	}
	return campaigns, nil
}

type CampaignStats struct {
	Source            string  `json:"source"`
	Medium            string  `json:"medium"`
	Campaign          string  `json:"campaign"`
	Pageviews         int64   `json:"pageviews"`
	Sessions          int64   `json:"sessions"`
	Users             int64   `json:"users"`
	Conversions       int64   `json:"conversions"`
	Revenue           float64 `json:"revenue"`
	ConversionRate    float64 `json:"conversion_rate"`
	RevenuePerSession float64 `json:"revenue_per_session"`
	GCLIDEvents       int64   `json:"gclid_events"`
	FBCLIDEvents      int64   `json:"fbclid_events"`
	TTCLIDEvents      int64   `json:"ttclid_events"`
	MSCLKIDEvents     int64   `json:"msclkid_events"`
}

// GetPages returns top pages. C2: single-pass query with period flag avoids 20 repeated param bindings.
// Results are cached for 5 minutes.
func (s *Stats) GetPages(ctx context.Context, siteID, from, to, previousFrom, previousTo string, limit int) ([]PageStats, error) {
	const ttl = 5 * time.Minute
	key := cacheKey("pages", siteID, from, to, previousFrom, previousTo, fmt.Sprintf("%d", limit))
	var cached []PageStats
	if s.cache.get(ctx, key, &cached) {
		return cached, nil
	}

	// Single-pass: ClickHouse evaluates each countIf once over the combined date range.
	// The outer WHERE spans previousFrom→to so all periods are in one scan.
	const q = `
		SELECT
			path,
			toInt64(countIf(event_name = 'pageview' AND event_time >= ? AND event_time <= ?)) as pageviews,
			toInt64(uniqExactIf(session_id, event_time >= ? AND event_time <= ?)) as sessions,
			toInt64(countIf(event_name = 'product_view' AND event_time >= ? AND event_time <= ?)) as product_views,
			toInt64(countIf(event_name = 'purchase' AND event_time >= ? AND event_time <= ?)) as purchases,
			toFloat64(sumIf(revenue, event_name = 'purchase' AND event_time >= ? AND event_time <= ?)) as total_revenue,
			toInt64(countIf(event_name = 'pageview' AND event_time >= ? AND event_time <= ?)) as prev_pageviews,
			toInt64(uniqExactIf(session_id, event_time >= ? AND event_time <= ?)) as prev_sessions,
			toInt64(countIf(event_name = 'product_view' AND event_time >= ? AND event_time <= ?)) as prev_product_views,
			toInt64(countIf(event_name = 'purchase' AND event_time >= ? AND event_time <= ?)) as prev_purchases,
			toFloat64(sumIf(revenue, event_name = 'purchase' AND event_time >= ? AND event_time <= ?)) as prev_revenue
		FROM analytics_events
		WHERE site_id = ? AND event_time >= ? AND event_time <= ? AND path != '' AND bot_score < 70
		GROUP BY path ORDER BY pageviews DESC LIMIT ?
	`

	rows, err := s.ch.Query(ctx, q,
		from, to, from, to, from, to, from, to, from, to,
		previousFrom, previousTo, previousFrom, previousTo, previousFrom, previousTo, previousFrom, previousTo, previousFrom, previousTo,
		siteID, previousFrom, to, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var pages []PageStats
	for rows.Next() {
		var page PageStats
		if err := rows.Scan(
			&page.Path,
			&page.Pageviews, &page.Sessions, &page.ProductViews, &page.Purchases, &page.Revenue,
			&page.PreviousPageviews, &page.PreviousSessions, &page.PreviousProductViews, &page.PreviousPurchases, &page.PreviousRevenue,
		); err != nil {
			return nil, err
		}
		page.PageviewsDelta = percentChange(page.Pageviews, page.PreviousPageviews)
		page.SessionsDelta = percentChange(page.Sessions, page.PreviousSessions)
		page.RevenueDelta = percentChangeFloat(page.Revenue, page.PreviousRevenue)
		pages = append(pages, page)
	}

	if pages != nil {
		s.cache.set(ctx, key, pages, ttl)
	}
	return pages, nil
}

type PageStats struct {
	Path                 string  `json:"path"`
	Pageviews            int64   `json:"pageviews"`
	Sessions             int64   `json:"sessions"`
	ProductViews         int64   `json:"product_views"`
	Purchases            int64   `json:"purchases"`
	Revenue              float64 `json:"revenue"`
	PreviousPageviews    int64   `json:"previous_pageviews"`
	PreviousSessions     int64   `json:"previous_sessions"`
	PreviousProductViews int64   `json:"previous_product_views"`
	PreviousPurchases    int64   `json:"previous_purchases"`
	PreviousRevenue      float64 `json:"previous_revenue"`
	PageviewsDelta       float64 `json:"pageviews_delta"`
	SessionsDelta        float64 `json:"sessions_delta"`
	RevenueDelta         float64 `json:"revenue_delta"`
}

// GetProducts returns product performance stats
func (s *Stats) GetProducts(ctx context.Context, siteID, from, to, previousFrom, previousTo string, limit int) ([]ProductStats, error) {
	query := `
		SELECT
			product_id,
			anyLast(product_name) as product_name,
			toInt64(countIf(event_name = 'product_view' AND event_time >= ? AND event_time <= ?)) as views,
			toInt64(countIf(event_name = 'add_to_cart' AND event_time >= ? AND event_time <= ?)) as add_to_carts,
			toInt64(countIf(event_name = 'purchase' AND event_time >= ? AND event_time <= ?)) as purchases,
			toFloat64(sumIf(revenue, event_name = 'purchase' AND event_time >= ? AND event_time <= ?)) as total_revenue,
			toInt64(sumIf(quantity, event_name = 'purchase' AND event_time >= ? AND event_time <= ?)) as units_sold,
			toInt64(countIf(event_name = 'product_view' AND event_time >= ? AND event_time <= ?)) as previous_views,
			toInt64(countIf(event_name = 'add_to_cart' AND event_time >= ? AND event_time <= ?)) as previous_add_to_carts,
			toInt64(countIf(event_name = 'purchase' AND event_time >= ? AND event_time <= ?)) as previous_purchases,
			toFloat64(sumIf(revenue, event_name = 'purchase' AND event_time >= ? AND event_time <= ?)) as previous_total_revenue,
			toInt64(sumIf(quantity, event_name = 'purchase' AND event_time >= ? AND event_time <= ?)) as previous_units_sold
		FROM analytics_events
		WHERE site_id = ? AND event_time >= ? AND event_time <= ? AND product_id != '' AND bot_score < 70
		GROUP BY product_id ORDER BY total_revenue DESC, views DESC LIMIT ?
	`

	rows, err := s.ch.Query(ctx, query,
		from, to,
		from, to,
		from, to,
		from, to,
		from, to,
		previousFrom, previousTo,
		previousFrom, previousTo,
		previousFrom, previousTo,
		previousFrom, previousTo,
		previousFrom, previousTo,
		siteID, previousFrom, to, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var products []ProductStats
	for rows.Next() {
		var product ProductStats
		if err := rows.Scan(
			&product.ProductID,
			&product.ProductName,
			&product.Views,
			&product.AddToCarts,
			&product.Purchases,
			&product.Revenue,
			&product.UnitsSold,
			&product.PreviousViews,
			&product.PreviousAddToCarts,
			&product.PreviousPurchases,
			&product.PreviousRevenue,
			&product.PreviousUnitsSold,
		); err != nil {
			return nil, err
		}
		if product.Views > 0 {
			product.ConversionRate = float64(product.Purchases) / float64(product.Views) * 100
			product.AddToCartRate = float64(product.AddToCarts) / float64(product.Views) * 100
			product.PurchaseRate = product.ConversionRate
		}
		if product.PreviousViews > 0 {
			product.PreviousAddToCartRate = float64(product.PreviousAddToCarts) / float64(product.PreviousViews) * 100
			product.PreviousPurchaseRate = float64(product.PreviousPurchases) / float64(product.PreviousViews) * 100
		}
		product.ViewsDelta = percentChange(product.Views, product.PreviousViews)
		product.RevenueDelta = percentChangeFloat(product.Revenue, product.PreviousRevenue)
		product.PurchaseRateDelta = product.PurchaseRate - product.PreviousPurchaseRate
		products = append(products, product)
	}

	return products, nil
}

type ProductStats struct {
	ProductID             string  `json:"product_id"`
	ProductName           string  `json:"product_name"`
	Views                 int64   `json:"views"`
	AddToCarts            int64   `json:"add_to_carts"`
	Purchases             int64   `json:"purchases"`
	Revenue               float64 `json:"revenue"`
	UnitsSold             int64   `json:"units_sold"`
	ConversionRate        float64 `json:"conversion_rate"`
	AddToCartRate         float64 `json:"add_to_cart_rate"`
	PurchaseRate          float64 `json:"purchase_rate"`
	PreviousViews         int64   `json:"previous_views"`
	PreviousAddToCarts    int64   `json:"previous_add_to_carts"`
	PreviousPurchases     int64   `json:"previous_purchases"`
	PreviousRevenue       float64 `json:"previous_revenue"`
	PreviousUnitsSold     int64   `json:"previous_units_sold"`
	PreviousAddToCartRate float64 `json:"previous_add_to_cart_rate"`
	PreviousPurchaseRate  float64 `json:"previous_purchase_rate"`
	ViewsDelta            float64 `json:"views_delta"`
	RevenueDelta          float64 `json:"revenue_delta"`
	PurchaseRateDelta     float64 `json:"purchase_rate_delta"`
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

// GetRealtimeEvents returns the latest live events for a site.
func (s *Stats) GetRealtimeEvents(ctx context.Context, siteID string, minutes, limit int) ([]RealtimeEvent, error) {
	if minutes <= 0 || minutes > 60 {
		minutes = 5
	}
	if limit <= 0 || limit > 100 {
		limit = 25
	}
	from := time.Now().UTC().Add(-time.Duration(minutes) * time.Minute).Format("2006-01-02 15:04:05.000")
	to := time.Now().UTC().Format("2006-01-02 15:04:05.000")

	query := `
		SELECT event_time, event_name, client_id, session_id, path, source, medium,
			campaign, product_id, product_name, order_id, toFloat64(revenue), currency, toInt32(bot_score)
		FROM analytics_events
		WHERE site_id = ? AND event_time >= ? AND event_time <= ? AND bot_score < 70
		ORDER BY event_time DESC LIMIT ?
	`

	rows, err := s.ch.Query(ctx, query, siteID, from, to, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	events := []RealtimeEvent{}
	for rows.Next() {
		var event RealtimeEvent
		var botScore int32
		if err := rows.Scan(
			&event.EventTime,
			&event.EventName,
			&event.ClientID,
			&event.SessionID,
			&event.Path,
			&event.Source,
			&event.Medium,
			&event.Campaign,
			&event.ProductID,
			&event.ProductName,
			&event.OrderID,
			&event.Revenue,
			&event.Currency,
			&botScore,
		); err != nil {
			return nil, err
		}
		event.BotScore = int(botScore)
		events = append(events, event)
	}

	return events, nil
}

type RealtimeEvent struct {
	EventTime   time.Time `json:"event_time"`
	EventName   string    `json:"event_name"`
	ClientID    string    `json:"client_id"`
	SessionID   string    `json:"session_id"`
	Path        string    `json:"path"`
	Source      string    `json:"source"`
	Medium      string    `json:"medium"`
	Campaign    string    `json:"campaign"`
	ProductID   string    `json:"product_id"`
	ProductName string    `json:"product_name"`
	OrderID     string    `json:"order_id"`
	Revenue     float64   `json:"revenue"`
	Currency    string    `json:"currency"`
	BotScore    int       `json:"bot_score"`
}

// GetPipelineHealth returns site processing freshness and Redis stream health.
func (s *Stats) GetPipelineHealth(ctx context.Context, siteID string, redisClient *redis.Client) (*PipelineHealth, error) {
	health := &PipelineHealth{
		Status:        "healthy",
		ConsumerGroup: "woosaas-workers",
		Stream:        "events:stream",
		DeadStream:    "events:dead",
		CheckedAt:     time.Now().UTC(),
	}

	if redisClient != nil {
		if streamLength, err := redisClient.XLen(ctx, health.Stream).Result(); err == nil {
			health.StreamLength = streamLength
		}
		if deadLength, err := redisClient.XLen(ctx, health.DeadStream).Result(); err == nil {
			health.DeadLetterLength = deadLength
		}
		if groups, err := redisClient.XInfoGroups(ctx, health.Stream).Result(); err == nil {
			for _, group := range groups {
				if group.Name == health.ConsumerGroup {
					health.ConsumerCount = group.Consumers
					health.Pending = group.Pending
					if group.Lag >= 0 {
						health.Lag = group.Lag
					}
					health.LastDeliveredID = group.LastDeliveredID
					break
				}
			}
		}
	}

	query := `
		SELECT max(received_at)
		FROM analytics_events
		WHERE site_id = ?
	`
	rows, err := s.ch.Query(ctx, query, siteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if rows.Next() {
		var latest time.Time
		if err := rows.Scan(&latest); err != nil {
			return nil, err
		}
		if !latest.IsZero() {
			health.LastProcessedAt = &latest
			age := time.Since(latest)
			health.LastProcessedAgeSeconds = int64(age.Seconds())
		}
	}

	health.QueueDepth = health.Pending + health.Lag
	switch {
	case health.DeadLetterLength > 0:
		health.Status = "degraded"
		health.Message = "Dead-letter events need review."
	case health.QueueDepth > 1000:
		health.Status = "degraded"
		health.Message = "Queue depth is high; worker may be falling behind."
	case health.ConsumerCount == 0 && health.StreamLength > 0:
		health.Status = "degraded"
		health.Message = "No Redis stream consumers are visible."
	case health.LastProcessedAt == nil:
		health.Status = "waiting"
		health.Message = "No processed events have reached ClickHouse for this site yet."
	case health.LastProcessedAgeSeconds > 900:
		health.Status = "idle"
		health.Message = "No events processed recently for this site."
	default:
		health.Message = "Worker and queue health look normal."
	}

	return health, nil
}

type PipelineHealth struct {
	Status                  string     `json:"status"`
	Message                 string     `json:"message"`
	Stream                  string     `json:"stream"`
	DeadStream              string     `json:"dead_stream"`
	ConsumerGroup           string     `json:"consumer_group"`
	StreamLength            int64      `json:"stream_length"`
	QueueDepth              int64      `json:"queue_depth"`
	Pending                 int64      `json:"pending"`
	Lag                     int64      `json:"lag"`
	DeadLetterLength        int64      `json:"dead_letter_length"`
	ConsumerCount           int64      `json:"consumer_count"`
	LastDeliveredID         string     `json:"last_delivered_id"`
	LastProcessedAt         *time.Time `json:"last_processed_at"`
	LastProcessedAgeSeconds int64      `json:"last_processed_age_seconds"`
	CheckedAt               time.Time  `json:"checked_at"`
}

func percentChange(current, previous int64) float64 {
	if previous == 0 {
		if current == 0 {
			return 0
		}
		return 100
	}
	return (float64(current-previous) / float64(previous)) * 100
}

func percentChangeFloat(current, previous float64) float64 {
	if previous == 0 {
		if current == 0 {
			return 0
		}
		return 100
	}
	return ((current - previous) / previous) * 100
}
