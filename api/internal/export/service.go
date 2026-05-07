package export

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
)

type ExportService struct {
	ch driver.Conn
}

func NewService(ch driver.Conn) *ExportService {
	return &ExportService{ch: ch}
}

type ExportData struct {
	SiteID   string    `json:"site_id"`
	DataType string    `json:"data_type"`
	From     time.Time `json:"from"`
	To       time.Time `json:"to"`
	Format   string    `json:"format"`
}

func (e *ExportService) Export(ctx context.Context, config ExportData) ([]byte, string, error) {
	switch config.DataType {
	case "events":
		return e.exportEvents(ctx, config)
	case "customers":
		return e.exportCustomers(ctx, config)
	case "orders":
		return e.exportOrders(ctx, config)
	default:
		return nil, "", fmt.Errorf("unsupported data type: %s", config.DataType)
	}
}

func (e *ExportService) exportEvents(ctx context.Context, config ExportData) ([]byte, string, error) {
	query := `
		SELECT event_time, event_id, event_name, client_id, session_id,
			url, path, source, medium, campaign, toFloat64(revenue)
		FROM analytics_events
		WHERE site_id = ? AND event_time >= ? AND event_time <= ? AND bot_score < 70
		ORDER BY event_time DESC LIMIT 100000
	`

	rows, err := e.ch.Query(ctx, query, config.SiteID, config.From, config.To)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	var buf bytes.Buffer
	writer := csv.NewWriter(&buf)
	writer.Write([]string{"Time", "Event ID", "Event", "Client ID", "Session ID", "URL", "Path", "Source", "Medium", "Campaign", "Revenue"})

	for rows.Next() {
		var eventTime time.Time
		var eventID, eventName, clientID, sessionID, url, path, source, medium, campaign string
		var revenue float64
		err := rows.Scan(&eventTime, &eventID, &eventName, &clientID, &sessionID, &url, &path, &source, &medium, &campaign, &revenue)
		if err != nil {
			continue
		}
		writer.Write([]string{eventTime.Format(time.RFC3339), eventID, eventName, clientID, sessionID, url, path, source, medium, campaign, fmt.Sprintf("%.2f", revenue)})
	}

	writer.Flush()
	return buf.Bytes(), "events_export.csv", nil
}

func (e *ExportService) exportCustomers(ctx context.Context, config ExportData) ([]byte, string, error) {
	query := `
		SELECT client_id, min(event_time), max(event_time),
			toInt64(uniqExact(session_id)), toInt64(countIf(event_name = 'purchase')),
			toFloat64(sumIf(revenue, event_name = 'purchase')) as total_revenue
		FROM analytics_events
		WHERE site_id = ? AND event_time >= ? AND event_time <= ? AND bot_score < 70
		GROUP BY client_id ORDER BY total_revenue DESC LIMIT 10000
	`

	rows, err := e.ch.Query(ctx, query, config.SiteID, config.From, config.To)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	var buf bytes.Buffer
	writer := csv.NewWriter(&buf)
	writer.Write([]string{"Client ID", "First Seen", "Last Seen", "Sessions", "Orders", "Revenue"})

	for rows.Next() {
		var clientID string
		var firstSeen, lastSeen time.Time
		var sessions, orders int64
		var revenue float64
		err := rows.Scan(&clientID, &firstSeen, &lastSeen, &sessions, &orders, &revenue)
		if err != nil {
			continue
		}
		writer.Write([]string{clientID, firstSeen.Format(time.RFC3339), lastSeen.Format(time.RFC3339), fmt.Sprintf("%d", sessions), fmt.Sprintf("%d", orders), fmt.Sprintf("%.2f", revenue)})
	}

	writer.Flush()
	return buf.Bytes(), "customers_export.csv", nil
}

func (e *ExportService) exportOrders(ctx context.Context, config ExportData) ([]byte, string, error) {
	query := `
		SELECT order_id, event_time, client_id, toFloat64(revenue), currency, source, medium, campaign
		FROM analytics_events
		WHERE site_id = ? AND event_time >= ? AND event_time <= ?
			AND event_name = 'purchase' AND bot_score < 70
		ORDER BY event_time DESC LIMIT 10000
	`

	rows, err := e.ch.Query(ctx, query, config.SiteID, config.From, config.To)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	var buf bytes.Buffer
	writer := csv.NewWriter(&buf)
	writer.Write([]string{"Order ID", "Time", "Client ID", "Revenue", "Currency", "Source", "Medium", "Campaign"})

	for rows.Next() {
		var orderID, clientID, currency, source, medium, campaign string
		var eventTime time.Time
		var revenue float64
		err := rows.Scan(&orderID, &eventTime, &clientID, &revenue, &currency, &source, &medium, &campaign)
		if err != nil {
			continue
		}
		writer.Write([]string{orderID, eventTime.Format(time.RFC3339), clientID, fmt.Sprintf("%.2f", revenue), currency, source, medium, campaign})
	}

	writer.Flush()
	return buf.Bytes(), "orders_export.csv", nil
}
