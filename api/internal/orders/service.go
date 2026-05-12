package orders

import (
	"context"

	"github.com/accnet/woosaas/api/pkg/models"
)

// Service is the application-layer facade over order ingestion and querying.
// Handlers depend on this instead of injecting Queue and Repository separately.
type Service struct {
	queue *Queue
	repo  *Repository
}

func NewService(queue *Queue, repo *Repository) *Service {
	return &Service{queue: queue, repo: repo}
}

func (s *Service) Enqueue(ctx context.Context, siteID string, order models.WooOrderInput, contactSync bool) error {
	return s.queue.Enqueue(ctx, siteID, order, contactSync)
}

func (s *Service) ListOrders(ctx context.Context, params ListOrdersParams) (*models.WooOrderListResponse, error) {
	return s.repo.ListOrders(ctx, params)
}

func (s *Service) GetOrderDetail(ctx context.Context, siteID, wooOrderID string) (*models.WooOrderDetail, error) {
	return s.repo.GetOrderDetail(ctx, siteID, wooOrderID)
}

func (s *Service) ListContacts(ctx context.Context, params ListContactsParams) (*models.WooContactListResponse, error) {
	return s.repo.ListContacts(ctx, params)
}

func (s *Service) GetRetentionCohort(ctx context.Context, siteID string) ([]RetentionCohort, error) {
	return s.repo.GetRetentionCohort(ctx, siteID)
}

func (s *Service) GetRefundStats(ctx context.Context, siteID, from, to string) (*RefundStats, error) {
	return s.repo.GetRefundStats(ctx, siteID, from, to)
}

func (s *Service) GetCrossSell(ctx context.Context, siteID string, limit int) ([]CrossSellPair, error) {
	return s.repo.GetCrossSell(ctx, siteID, limit)
}

func (s *Service) GetSyncState(ctx context.Context, siteID string) (*models.WooOrderSyncState, error) {
	return s.repo.GetSyncState(ctx, siteID)
}

func (s *Service) UpdateBackfillState(ctx context.Context, siteID string, req models.WooOrderBackfillStateRequest) error {
	return s.repo.UpdateBackfillState(ctx, siteID, req)
}

func (s *Service) UpsertOrderSnapshot(ctx context.Context, siteID string, order models.WooOrderInput, contactSyncEnabled bool) error {
	return s.repo.UpsertOrderSnapshot(ctx, siteID, order, contactSyncEnabled)
}

func (s *Service) MarkSyncError(ctx context.Context, siteID string, contactSyncEnabled bool, syncErr error) error {
	return s.repo.MarkSyncError(ctx, siteID, contactSyncEnabled, syncErr)
}
