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
	TotalEvents    int64            `json:"total_events"`
	BotEvents      int64            `json:"bot_events"`
	HumanEvents    int64            `json:"human_events"`
	BotPercentage  float64          `json:"bot_percentage"`
	TopBotReasons  []BotReasonStat  `json:"top_bot_reasons"`
	TopBotSources  []BotSourceStat  `json:"top_bot_sources"`
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

	reasonQuery := `
		SELECT bot_reason, count() as cnt
		FROM analytics_events
		WHERE site_id = ? AND event_time >= ? AND event_time <= ? AND bot_score >= 70 AND bot_reason != ''
		GROUP BY bot_reason ORDER BY cnt DESC LIMIT 10
	`
	reasonRows, err := b.ch.Query(ctx, reasonQuery, siteID, from, to)
	if err == nil {
		for reasonRows.Next() {
			var stat BotReasonStat
			if err := reasonRows.Scan(&stat.Reason, &stat.Count); err == nil {
				report.TopBotReasons = append(report.TopBotReasons, stat)
			}
		}
		reasonRows.Close()
	}

	sourceQuery := `
		SELECT ifEmpty(source, 'direct') as source, count() as cnt
		FROM analytics_events
		WHERE site_id = ? AND event_time >= ? AND event_time <= ? AND bot_score >= 70
		GROUP BY source ORDER BY cnt DESC LIMIT 10
	`
	sourceRows, err := b.ch.Query(ctx, sourceQuery, siteID, from, to)
	if err == nil {
		for sourceRows.Next() {
			var stat BotSourceStat
			if err := sourceRows.Scan(&stat.Source, &stat.Count); err == nil {
				report.TopBotSources = append(report.TopBotSources, stat)
			}
		}
		sourceRows.Close()
	}

	sessionQuery := `
		SELECT session_id, ip_hash, user_agent, count() as event_count, max(bot_score) as max_score
		FROM analytics_events
		WHERE site_id = ? AND event_time >= ? AND event_time <= ? AND bot_score >= 70
		GROUP BY session_id, ip_hash, user_agent ORDER BY event_count DESC LIMIT 20
	`
	sessionRows, err := b.ch.Query(ctx, sessionQuery, siteID, from, to)
	if err == nil {
		for sessionRows.Next() {
			var stat BotSessionStat
			if err := sessionRows.Scan(&stat.SessionID, &stat.IPHash, &stat.UserAgent, &stat.EventCount, &stat.BotScore); err == nil {
				report.TopBotSessions = append(report.TopBotSessions, stat)
			}
		}
		sessionRows.Close()
	}

	if report.TopBotReasons == nil {
		report.TopBotReasons = []BotReasonStat{}
	}
	if report.TopBotSources == nil {
		report.TopBotSources = []BotSourceStat{}
	}
	if report.TopBotSessions == nil {
		report.TopBotSessions = []BotSessionStat{}
	}

	return &report, nil
}
