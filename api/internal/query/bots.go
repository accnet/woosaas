package query

import (
	"context"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
)

type Bots struct {
	ch driver.Conn
}

func NewBots(ch driver.Conn) *Bots {
	return &Bots{ch: ch}
}

type BotReport struct {
	TotalEvents   int64             `json:"total_events"`
	BotEvents     int64             `json:"bot_events"`
	HumanEvents   int64             `json:"human_events"`
	BotPercentage float64           `json:"bot_percentage"`
	TopBotReasons []BotReasonStat   `json:"top_bot_reasons"`
	TopBotSources []BotSourceStat   `json:"top_bot_sources"`
	TopBotSessions []BotSessionStat `json:"top_bot_sessions"`
}

type BotReasonStat struct {
	Reason string `json:"reason"`
	Count  int64  `json:"count"`
}

type BotSourceStat struct {
	Source string `json:"source"`
	Count  int64  `json:"count"`
}

type BotSessionStat struct {
	SessionID  string `json:"session_id"`
	IPHash     string `json:"ip_hash"`
	UserAgent  string `json:"user_agent"`
	EventCount int64  `json:"event_count"`
	BotScore   int    `json:"bot_score"`
}

func (b *Bots) GetReport(ctx context.Context, siteID, from, to string) (*BotReport, error) {
	query := `
		SELECT count() as total, countIf(bot_score >= 70) as bot_count,
			countIf(bot_score < 70) as human_count
		FROM analytics_events
		WHERE site_id = ? AND event_time >= ? AND event_time <= ?
	`

	var report BotReport
	rows, err := b.ch.Query(ctx, query, siteID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if rows.Next() {
		err := rows.Scan(&report.TotalEvents, &report.BotEvents, &report.HumanEvents)
		if err != nil {
			return nil, err
		}
	}

	if report.TotalEvents > 0 {
		report.BotPercentage = float64(report.BotEvents) / float64(report.TotalEvents) * 100
	}

	// Top bot reasons
	reasonQuery := `
		SELECT bot_reason, count() as cnt
		FROM analytics_events
		WHERE site_id = ? AND event_time >= ? AND event_time <= ? AND bot_score >= 70 AND bot_reason != ''
		GROUP BY bot_reason ORDER BY cnt DESC LIMIT 10
	`
	rows, err = b.ch.Query(ctx, reasonQuery, siteID, from, to)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var stat BotReasonStat
			if err := rows.Scan(&stat.Reason, &stat.Count); err == nil {
				report.TopBotReasons = append(report.TopBotReasons, stat)
			}
		}
	}

	// Top bot sources
	sourceQuery := `
		SELECT ifEmpty(source, 'direct') as source, count() as cnt
		FROM analytics_events
		WHERE site_id = ? AND event_time >= ? AND event_time <= ? AND bot_score >= 70
		GROUP BY source ORDER BY cnt DESC LIMIT 10
	`
	rows, err = b.ch.Query(ctx, sourceQuery, siteID, from, to)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var stat BotSourceStat
			if err := rows.Scan(&stat.Source, &stat.Count); err == nil {
				report.TopBotSources = append(report.TopBotSources, stat)
			}
		}
	}

	// Top bot sessions
	sessionQuery := `
		SELECT session_id, ip_hash, user_agent, count() as event_count, max(bot_score) as max_score
		FROM analytics_events
		WHERE site_id = ? AND event_time >= ? AND event_time <= ? AND bot_score >= 70
		GROUP BY session_id, ip_hash, user_agent ORDER BY event_count DESC LIMIT 20
	`
	rows, err = b.ch.Query(ctx, sessionQuery, siteID, from, to)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var stat BotSessionStat
			if err := rows.Scan(&stat.SessionID, &stat.IPHash, &stat.UserAgent, &stat.EventCount, &stat.BotScore); err == nil {
				report.TopBotSessions = append(report.TopBotSessions, stat)
			}
		}
	}

	return &report, nil
}