package orders

import (
	"context"
)

// GetRetentionCohort returns monthly cohort repeat-purchase rates (last 12 months).
// Uses commerce_order_contacts.first_seen_at as the cohort date and orders_count to detect repeat buyers.
func (r *Repository) GetRetentionCohort(ctx context.Context, siteID string) ([]RetentionCohort, error) {
	query := `
		SELECT
			TO_CHAR(DATE_TRUNC('month', first_seen_at), 'YYYY-MM') AS cohort,
			COUNT(*) AS new_customers,
			SUM(CASE WHEN orders_count > 1 THEN 1 ELSE 0 END) AS returning_customers,
			ROUND(SUM(CASE WHEN orders_count > 1 THEN 1 ELSE 0 END)::numeric
			      / NULLIF(COUNT(*), 0) * 100, 1) AS repeat_rate
		FROM commerce_order_contacts
		WHERE site_id = $1
		  AND first_seen_at IS NOT NULL
		  AND first_seen_at >= NOW() - INTERVAL '12 months'
		GROUP BY DATE_TRUNC('month', first_seen_at)
		ORDER BY cohort DESC
	`

	rows, err := r.db.Query(ctx, query, siteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cohorts []RetentionCohort
	for rows.Next() {
		var c RetentionCohort
		if err := rows.Scan(&c.Cohort, &c.NewCustomers, &c.ReturningCustomers, &c.RepeatRate); err != nil {
			return nil, err
		}
		cohorts = append(cohorts, c)
	}
	if cohorts == nil {
		cohorts = []RetentionCohort{}
	}
	return cohorts, nil
}

type RetentionCohort struct {
	Cohort             string  `json:"cohort"`
	NewCustomers       int64   `json:"new_customers"`
	ReturningCustomers int64   `json:"returning_customers"`
	RepeatRate         float64 `json:"repeat_rate"`
}

// GetRefundStats returns refund rate summary, monthly trend, and top refunded products.
func (r *Repository) GetRefundStats(ctx context.Context, siteID, from, to string) (*RefundStats, error) {
	var stats RefundStats

	summaryQ := `
		SELECT
			COUNT(*) AS total_orders,
			SUM(CASE WHEN payment_status = 'refunded' THEN 1 ELSE 0 END) AS refunded_orders,
			COALESCE(SUM(CASE WHEN payment_status = 'refunded' THEN total_amount ELSE 0 END), 0) AS refunded_revenue,
			COALESCE(SUM(total_amount), 0) AS total_revenue
		FROM commerce_orders
		WHERE site_id = $1
		  AND created_at_woo >= $2::timestamptz
		  AND created_at_woo <= $3::timestamptz
	`
	if err := r.db.QueryRow(ctx, summaryQ, siteID, from, to).Scan(
		&stats.TotalOrders, &stats.RefundedOrders, &stats.RefundedRevenue, &stats.TotalRevenue,
	); err != nil {
		return nil, err
	}
	if stats.TotalOrders > 0 {
		stats.RefundRate = float64(stats.RefundedOrders) / float64(stats.TotalOrders) * 100
	}

	trendQ := `
		SELECT
			TO_CHAR(DATE_TRUNC('month', created_at_woo), 'YYYY-MM') AS month,
			COUNT(*) AS total_orders,
			SUM(CASE WHEN payment_status = 'refunded' THEN 1 ELSE 0 END) AS refunded_orders,
			COALESCE(SUM(CASE WHEN payment_status = 'refunded' THEN total_amount ELSE 0 END), 0) AS refunded_revenue
		FROM commerce_orders
		WHERE site_id = $1
		  AND created_at_woo >= $2::timestamptz
		  AND created_at_woo <= $3::timestamptz
		GROUP BY DATE_TRUNC('month', created_at_woo)
		ORDER BY month ASC
	`
	trendRows, err := r.db.Query(ctx, trendQ, siteID, from, to)
	if err != nil {
		return nil, err
	}
	defer trendRows.Close()

	for trendRows.Next() {
		var t RefundTrendPoint
		if err := trendRows.Scan(&t.Month, &t.TotalOrders, &t.RefundedOrders, &t.RefundedRevenue); err != nil {
			return nil, err
		}
		if t.TotalOrders > 0 {
			t.RefundRate = float64(t.RefundedOrders) / float64(t.TotalOrders) * 100
		}
		stats.Trend = append(stats.Trend, t)
	}

	topQ := `
		SELECT
			oi.name AS product_name,
			COUNT(DISTINCT o.id) AS refund_count,
			COALESCE(SUM(oi.line_total), 0) AS refunded_amount
		FROM commerce_orders o
		JOIN commerce_order_items oi
		  ON oi.site_id = o.site_id AND oi.source_platform = o.source_platform AND oi.woo_order_id = o.woo_order_id
		WHERE o.site_id = $1
		  AND o.created_at_woo >= $2::timestamptz
		  AND o.created_at_woo <= $3::timestamptz
		  AND o.payment_status = 'refunded'
		  AND oi.name IS NOT NULL AND oi.name <> ''
		GROUP BY oi.name
		ORDER BY refund_count DESC
		LIMIT 10
	`
	topRows, err := r.db.Query(ctx, topQ, siteID, from, to)
	if err != nil {
		return nil, err
	}
	defer topRows.Close()

	for topRows.Next() {
		var p RefundedProduct
		if err := topRows.Scan(&p.ProductName, &p.RefundCount, &p.RefundedAmount); err != nil {
			return nil, err
		}
		stats.TopRefundedProducts = append(stats.TopRefundedProducts, p)
	}

	if stats.Trend == nil {
		stats.Trend = []RefundTrendPoint{}
	}
	if stats.TopRefundedProducts == nil {
		stats.TopRefundedProducts = []RefundedProduct{}
	}
	return &stats, nil
}

type RefundStats struct {
	TotalOrders         int64              `json:"total_orders"`
	RefundedOrders      int64              `json:"refunded_orders"`
	RefundRate          float64            `json:"refund_rate"`
	RefundedRevenue     float64            `json:"refunded_revenue"`
	TotalRevenue        float64            `json:"total_revenue"`
	Trend               []RefundTrendPoint `json:"trend"`
	TopRefundedProducts []RefundedProduct  `json:"top_refunded_products"`
}

type RefundTrendPoint struct {
	Month           string  `json:"month"`
	TotalOrders     int64   `json:"total_orders"`
	RefundedOrders  int64   `json:"refunded_orders"`
	RefundedRevenue float64 `json:"refunded_revenue"`
	RefundRate      float64 `json:"refund_rate"`
}

type RefundedProduct struct {
	ProductName    string  `json:"product_name"`
	RefundCount    int64   `json:"refund_count"`
	RefundedAmount float64 `json:"refunded_amount"`
}

// GetCrossSell returns product pairs frequently purchased together.
func (r *Repository) GetCrossSell(ctx context.Context, siteID string, limit int) ([]CrossSellPair, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	query := `
		SELECT
			a.name AS product_a,
			b.name AS product_b,
			COUNT(*) AS co_purchase_count
		FROM commerce_order_items a
		JOIN commerce_order_items b
		  ON a.site_id = b.site_id AND a.source_platform = b.source_platform AND a.woo_order_id = b.woo_order_id AND a.product_id < b.product_id
		JOIN commerce_orders o
		  ON o.site_id = a.site_id AND o.source_platform = a.source_platform AND o.woo_order_id = a.woo_order_id
		WHERE o.site_id = $1
		  AND o.payment_status = 'paid'
		  AND a.name IS NOT NULL AND a.name <> ''
		  AND b.name IS NOT NULL AND b.name <> ''
		GROUP BY a.name, b.name
		ORDER BY co_purchase_count DESC
		LIMIT $2
	`

	rows, err := r.db.Query(ctx, query, siteID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var pairs []CrossSellPair
	for rows.Next() {
		var p CrossSellPair
		if err := rows.Scan(&p.ProductA, &p.ProductB, &p.CoPurchaseCount); err != nil {
			return nil, err
		}
		pairs = append(pairs, p)
	}
	if pairs == nil {
		pairs = []CrossSellPair{}
	}
	return pairs, nil
}

type CrossSellPair struct {
	ProductA        string `json:"product_a"`
	ProductB        string `json:"product_b"`
	CoPurchaseCount int64  `json:"co_purchase_count"`
}
