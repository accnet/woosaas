package sites

import (
	"context"
	"fmt"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/accnet/woosaas/api/internal/observability"
)

type siteDataRepository interface {
	DeleteSite(ctx context.Context, id string) error
	ResetSiteData(ctx context.Context, id string) error
}

type clickhouseMutationConn interface {
	Exec(ctx context.Context, query string, args ...interface{}) error
}

type SiteDataService struct {
	repo   siteDataRepository
	ch     clickhouseMutationConn
	logger *observability.StructuredLogger
}

func NewSiteDataService(repo siteDataRepository, ch driver.Conn, logger *observability.StructuredLogger) *SiteDataService {
	return &SiteDataService{repo: repo, ch: ch, logger: logger}
}

func (s *SiteDataService) DeleteSiteWithData(ctx context.Context, siteID string) error {
	if err := s.deleteAnalyticsEvents(ctx, siteID, "delete_site_clickhouse"); err != nil {
		return err
	}
	return s.repo.DeleteSite(ctx, siteID)
}

func (s *SiteDataService) ResetSiteData(ctx context.Context, siteID string) error {
	if err := s.deleteAnalyticsEvents(ctx, siteID, "reset_site_data_clickhouse"); err != nil {
		return err
	}
	return s.repo.ResetSiteData(ctx, siteID)
}

func (s *SiteDataService) deleteAnalyticsEvents(ctx context.Context, siteID, operation string) error {
	if s.ch == nil {
		return fmt.Errorf("clickhouse connection is not configured")
	}

	if err := s.ch.Exec(ctx, `ALTER TABLE analytics_events DELETE WHERE site_id = ?`, siteID); err != nil {
		if s.logger != nil {
			s.logger.LogError(ctx, operation, err, map[string]interface{}{"site_id": siteID})
		}
		return fmt.Errorf("failed to queue analytics deletion: %w", err)
	}

	if s.logger != nil {
		s.logger.LogEvent(ctx, operation, map[string]interface{}{
			"site_id": siteID,
			"table":   "analytics_events",
		})
	}

	return nil
}
