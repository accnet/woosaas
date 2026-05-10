package query

import (
	"context"
	"fmt"
	"time"
)

// GetDeviceStats returns breakdown by device_type, browser, and OS.
func (s *Stats) GetDeviceStats(ctx context.Context, siteID, from, to string) (*DeviceStats, error) {
	const ttl = 5 * time.Minute
	key := cacheKey("devices", siteID, from, to)
	var cached DeviceStats
	if s.cache.get(ctx, key, &cached) {
		return &cached, nil
	}

	deviceQ := `
		SELECT if(device_type = '', 'unknown', device_type) as label,
			toInt64(uniqExact(session_id)) as sessions,
			toInt64(countIf(event_name = 'purchase')) as conversions,
			toFloat64(sumIf(revenue, event_name = 'purchase')) as revenue
		FROM analytics_events
		WHERE site_id = ? AND event_time >= ? AND event_time <= ? AND bot_score < 70
		GROUP BY label ORDER BY sessions DESC
	`
	browserQ := `
		SELECT if(browser = '', 'unknown', browser) as label,
			toInt64(uniqExact(session_id)) as sessions,
			toInt64(countIf(event_name = 'purchase')) as conversions,
			toFloat64(sumIf(revenue, event_name = 'purchase')) as revenue
		FROM analytics_events
		WHERE site_id = ? AND event_time >= ? AND event_time <= ? AND bot_score < 70
		GROUP BY label ORDER BY sessions DESC LIMIT 10
	`
	osQ := `
		SELECT if(os = '', 'unknown', os) as label,
			toInt64(uniqExact(session_id)) as sessions,
			toInt64(countIf(event_name = 'purchase')) as conversions,
			toFloat64(sumIf(revenue, event_name = 'purchase')) as revenue
		FROM analytics_events
		WHERE site_id = ? AND event_time >= ? AND event_time <= ? AND bot_score < 70
		GROUP BY label ORDER BY sessions DESC LIMIT 10
	`

	scanBreakdown := func(q string) ([]DeviceBreakdown, error) {
		rows, err := s.ch.Query(ctx, q, siteID, from, to)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		var out []DeviceBreakdown
		for rows.Next() {
			var d DeviceBreakdown
			if err := rows.Scan(&d.Name, &d.Sessions, &d.Conversions, &d.Revenue); err != nil {
				return nil, err
			}
			if d.Sessions > 0 {
				d.ConversionRate = float64(d.Conversions) / float64(d.Sessions) * 100
			}
			out = append(out, d)
		}
		return out, nil
	}

	devices, err := scanBreakdown(deviceQ)
	if err != nil {
		return nil, err
	}
	browsers, err := scanBreakdown(browserQ)
	if err != nil {
		return nil, err
	}
	oss, err := scanBreakdown(osQ)
	if err != nil {
		return nil, err
	}

	if devices == nil {
		devices = []DeviceBreakdown{}
	}
	if browsers == nil {
		browsers = []DeviceBreakdown{}
	}
	if oss == nil {
		oss = []DeviceBreakdown{}
	}

	result := DeviceStats{ByDevice: devices, ByBrowser: browsers, ByOS: oss}
	s.cache.set(ctx, key, &result, ttl)
	return &result, nil
}

type DeviceStats struct {
	ByDevice  []DeviceBreakdown `json:"by_device"`
	ByBrowser []DeviceBreakdown `json:"by_browser"`
	ByOS      []DeviceBreakdown `json:"by_os"`
}

type DeviceBreakdown struct {
	Name           string  `json:"name"`
	Sessions       int64   `json:"sessions"`
	Conversions    int64   `json:"conversions"`
	Revenue        float64 `json:"revenue"`
	ConversionRate float64 `json:"conversion_rate"`
}

// GetGeoStats returns breakdown by country.
func (s *Stats) GetGeoStats(ctx context.Context, siteID, from, to string) ([]GeoStat, error) {
	const ttl = 5 * time.Minute
	key := cacheKey("geo", siteID, from, to)
	var cached []GeoStat
	if s.cache.get(ctx, key, &cached) {
		return cached, nil
	}

	query := `
		SELECT if(country = '', 'Unknown', country) as country,
			toInt64(uniqExact(session_id)) as sessions,
			toInt64(uniqExact(client_id)) as users,
			toInt64(countIf(event_name = 'purchase')) as conversions,
			toFloat64(sumIf(revenue, event_name = 'purchase')) as revenue
		FROM analytics_events
		WHERE site_id = ? AND event_time >= ? AND event_time <= ? AND bot_score < 70
		GROUP BY country ORDER BY sessions DESC LIMIT 50
	`

	rows, err := s.ch.Query(ctx, query, siteID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stats []GeoStat
	for rows.Next() {
		var stat GeoStat
		if err := rows.Scan(&stat.Country, &stat.Sessions, &stat.Users, &stat.Conversions, &stat.Revenue); err != nil {
			return nil, err
		}
		if stat.Sessions > 0 {
			stat.ConversionRate = float64(stat.Conversions) / float64(stat.Sessions) * 100
		}
		stats = append(stats, stat)
	}

	if stats == nil {
		stats = []GeoStat{}
	}
	s.cache.set(ctx, key, stats, ttl)
	return stats, nil
}

type GeoStat struct {
	Country        string  `json:"country"`
	Sessions       int64   `json:"sessions"`
	Users          int64   `json:"users"`
	Conversions    int64   `json:"conversions"`
	Revenue        float64 `json:"revenue"`
	ConversionRate float64 `json:"conversion_rate"`
}

// GetAbandonmentStats returns cart abandonment analysis.
func (s *Stats) GetAbandonmentStats(ctx context.Context, siteID, from, to string) (*AbandonmentStats, error) {
	const ttl = 5 * time.Minute
	key := cacheKey("abandonment", siteID, from, to)
	var cached AbandonmentStats
	if s.cache.get(ctx, key, &cached) {
		return &cached, nil
	}

	summaryQ := `
		SELECT
			toInt64(countIf(has_cart = 1 AND has_purchase = 0)) as abandoned_sessions,
			toInt64(countIf(has_cart = 1)) as cart_sessions,
			toFloat64(avgIf(session_revenue, has_purchase = 1)) as aov
		FROM (
			SELECT session_id,
				toUInt8(maxIf(1, event_name = 'add_to_cart')) as has_cart,
				toUInt8(maxIf(1, event_name = 'purchase')) as has_purchase,
				toFloat64(sumIf(revenue, event_name = 'purchase')) as session_revenue
			FROM analytics_events
			WHERE site_id = ? AND event_time >= ? AND event_time <= ? AND bot_score < 70
			GROUP BY session_id
		)
	`

	summaryRows, err := s.ch.Query(ctx, summaryQ, siteID, from, to)
	if err != nil {
		return nil, err
	}
	defer summaryRows.Close()

	var result AbandonmentStats
	if summaryRows.Next() {
		if err := summaryRows.Scan(&result.AbandonedSessions, &result.CartSessions, &result.AOV); err != nil {
			return nil, err
		}
	}
	if result.CartSessions > 0 {
		result.AbandonmentRate = float64(result.AbandonedSessions) / float64(result.CartSessions) * 100
		result.EstimatedLostRevenue = float64(result.AbandonedSessions) * result.AOV
	}

	topQ := `
		SELECT product_id, anyLast(product_name) as product_name,
			toInt64(countIf(event_name = 'add_to_cart')) as add_to_carts,
			toInt64(countIf(event_name = 'purchase')) as purchases
		FROM analytics_events
		WHERE site_id = ? AND event_time >= ? AND event_time <= ? AND bot_score < 70 AND product_id != ''
		GROUP BY product_id
		ORDER BY (add_to_carts - purchases) DESC
		LIMIT 10
	`

	topRows, err := s.ch.Query(ctx, topQ, siteID, from, to)
	if err != nil {
		return nil, err
	}
	defer topRows.Close()

	for topRows.Next() {
		var p AbandonedProduct
		if err := topRows.Scan(&p.ProductID, &p.ProductName, &p.AddToCarts, &p.Purchases); err != nil {
			return nil, err
		}
		p.Abandoned = p.AddToCarts - p.Purchases
		if p.Abandoned < 0 {
			p.Abandoned = 0
		}
		if p.AddToCarts > 0 {
			p.AbandonRate = float64(p.Abandoned) / float64(p.AddToCarts) * 100
		}
		result.TopAbandonedProducts = append(result.TopAbandonedProducts, p)
	}

	if result.TopAbandonedProducts == nil {
		result.TopAbandonedProducts = []AbandonedProduct{}
	}
	s.cache.set(ctx, key, &result, ttl)
	return &result, nil
}

type AbandonmentStats struct {
	AbandonedSessions    int64              `json:"abandoned_sessions"`
	CartSessions         int64              `json:"cart_sessions"`
	AbandonmentRate      float64            `json:"abandonment_rate"`
	AOV                  float64            `json:"aov"`
	EstimatedLostRevenue float64            `json:"estimated_lost_revenue"`
	TopAbandonedProducts []AbandonedProduct `json:"top_abandoned_products"`
}

type AbandonedProduct struct {
	ProductID   string  `json:"product_id"`
	ProductName string  `json:"product_name"`
	AddToCarts  int64   `json:"add_to_carts"`
	Purchases   int64   `json:"purchases"`
	Abandoned   int64   `json:"abandoned"`
	AbandonRate float64 `json:"abandon_rate"`
}

// GetHeatmapStats returns a sessions/revenue/conversions value per hour-of-day × day-of-week cell.
func (s *Stats) GetHeatmapStats(ctx context.Context, siteID, from, to, metric string) ([]HeatmapCell, error) {
	const ttl = 5 * time.Minute
	key := cacheKey("heatmap", siteID, from, to, metric)
	var cached []HeatmapCell
	if s.cache.get(ctx, key, &cached) {
		return cached, nil
	}

	var valueExpr string
	switch metric {
	case "revenue":
		valueExpr = "toFloat64(sumIf(revenue, event_name = 'purchase'))"
	case "conversions":
		valueExpr = "toFloat64(countIf(event_name = 'purchase'))"
	default: // sessions
		valueExpr = "toFloat64(uniqExact(session_id))"
	}

	query := fmt.Sprintf(`
		SELECT
			toInt32(toDayOfWeek(event_time)) as day_of_week,
			toInt32(toHour(event_time)) as hour_of_day,
			%s as value
		FROM analytics_events
		WHERE site_id = ? AND event_time >= ? AND event_time <= ? AND bot_score < 70
		GROUP BY day_of_week, hour_of_day
		ORDER BY day_of_week, hour_of_day
	`, valueExpr)

	rows, err := s.ch.Query(ctx, query, siteID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cells []HeatmapCell
	for rows.Next() {
		var cell HeatmapCell
		if err := rows.Scan(&cell.DayOfWeek, &cell.HourOfDay, &cell.Value); err != nil {
			return nil, err
		}
		cells = append(cells, cell)
	}

	if cells == nil {
		cells = []HeatmapCell{}
	}
	s.cache.set(ctx, key, cells, ttl)
	return cells, nil
}

type HeatmapCell struct {
	DayOfWeek int32   `json:"day_of_week"` // 1=Monday … 7=Sunday (ClickHouse toDayOfWeek default)
	HourOfDay int32   `json:"hour_of_day"` // 0–23 UTC
	Value     float64 `json:"value"`
}

// GetChannelStats returns revenue, sessions, and conversions grouped by marketing channel.
// Channel is derived from source+medium using standard GA-style bucketing:
//
//	paid_search  → medium contains 'cpc'/'ppc'/'paidsearch' or gclid/msclkid present
//	paid_social  → medium contains 'paid' and source contains social networks, or fbclid/ttclid present
//	organic_search → medium = 'organic'
//	organic_social → source contains known social networks and medium is not paid
//	email        → medium = 'email'
//	referral     → medium = 'referral' or (source != '' and medium = '')
//	direct       → source = '' and medium = ''
//	other        → everything else
func (s *Stats) GetChannelStats(ctx context.Context, siteID, from, to string) ([]ChannelStat, error) {
	const ttl = 5 * time.Minute
	key := cacheKey("channels", siteID, from, to)
	var cached []ChannelStat
	if s.cache.get(ctx, key, &cached) {
		return cached, nil
	}

	// Classify channel per session using the first-touch event of each session.
	// We use a CTE over session-level aggregates to assign exactly one channel per session.
	query := `
		SELECT
			channel,
			toInt64(count()) as sessions,
			toInt64(uniqExact(client_id)) as users,
			toInt64(sum(purchases)) as conversions,
			toFloat64(sum(revenue)) as revenue
		FROM (
			SELECT
				session_id,
				anyLast(client_id) as client_id,
				toInt64(countIf(event_name = 'purchase')) as purchases,
				toFloat64(sumIf(revenue, event_name = 'purchase')) as revenue,
				multiIf(
					any(gclid) != '' OR any(msclkid) != '' OR lower(any(medium)) IN ('cpc','ppc','paidsearch','paid search'), 'paid_search',
					any(fbclid) != '' OR any(ttclid) != '' OR (lower(any(medium)) LIKE '%paid%' AND any(source) IN ('facebook','instagram','tiktok','twitter','x','pinterest','snapchat','linkedin')), 'paid_social',
					lower(any(medium)) = 'organic', 'organic_search',
					any(source) IN ('facebook','instagram','tiktok','twitter','x','pinterest','snapchat','linkedin','youtube') AND lower(any(medium)) NOT LIKE '%paid%', 'organic_social',
					lower(any(medium)) = 'email', 'email',
					lower(any(medium)) = 'referral' OR (any(source) != '' AND any(medium) = ''), 'referral',
					any(source) = '' AND any(medium) = '', 'direct',
					'other'
				) as channel
			FROM analytics_events
			WHERE site_id = ? AND event_time >= ? AND event_time <= ? AND bot_score < 70
			GROUP BY session_id
		)
		GROUP BY channel
		ORDER BY revenue DESC
	`

	rows, err := s.ch.Query(ctx, query, siteID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stats []ChannelStat
	for rows.Next() {
		var c ChannelStat
		if err := rows.Scan(&c.Channel, &c.Sessions, &c.Users, &c.Conversions, &c.Revenue); err != nil {
			return nil, err
		}
		if c.Sessions > 0 {
			c.ConversionRate = float64(c.Conversions) / float64(c.Sessions) * 100
		}
		if c.Conversions > 0 {
			c.AOV = c.Revenue / float64(c.Conversions)
		}
		stats = append(stats, c)
	}

	if stats == nil {
		stats = []ChannelStat{}
	}
	s.cache.set(ctx, key, stats, ttl)
	return stats, nil
}

type ChannelStat struct {
	Channel        string  `json:"channel"`
	Sessions       int64   `json:"sessions"`
	Users          int64   `json:"users"`
	Conversions    int64   `json:"conversions"`
	Revenue        float64 `json:"revenue"`
	ConversionRate float64 `json:"conversion_rate"`
	AOV            float64 `json:"aov"`
}
