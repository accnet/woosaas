package shipment_tracking

import (
	"context"
	"errors"
	"strings"

	appCrypto "github.com/accnet/woosaas/api/internal/crypto"
	"github.com/accnet/woosaas/api/pkg/models"
	"github.com/jackc/pgx/v5"
)

type SiteLookup interface {
	GetSiteByID(ctx context.Context, id string) (*models.Site, error)
}

type Service struct {
	repo          *Repository
	sites         SiteLookup
	encryptionKey []byte
	wcPush        *WCPushClient
}

func NewService(repo *Repository, sites SiteLookup, encryptionKey []byte) *Service {
	return &Service{
		repo:          repo,
		sites:         sites,
		encryptionKey: encryptionKey,
		wcPush:        NewWCPushClient(),
	}
}

func (s *Service) List(ctx context.Context, siteID, wooOrderID string) ([]ShipmentTracking, error) {
	return s.repo.ListByOrder(ctx, siteID, SourcePlatformWooCommerce, wooOrderID)
}

func (s *Service) Add(ctx context.Context, siteID, wooOrderID string, req AddTrackingRequest) (*ShipmentTracking, error) {
	trackingNumber := strings.TrimSpace(req.TrackingNumber)
	if trackingNumber == "" {
		return nil, errors.New("tracking_number is required")
	}

	tracking, err := s.repo.Create(ctx, CreateTrackingInput{
		SiteID:         siteID,
		SourcePlatform: SourcePlatformWooCommerce,
		WooOrderID:     wooOrderID,
		TrackingNumber: trackingNumber,
		CarrierSlug:    optionalString(req.CarrierSlug),
		CarrierName:    optionalString(req.CarrierName),
		TrackingURL:    optionalString(req.TrackingURL),
		Provider:       ProviderManual,
		Status:         StatusFulfilled,
	})
	if err != nil {
		return nil, err
	}

	_ = s.repo.ApplyTrackingStatusToOrder(ctx, siteID, SourcePlatformWooCommerce, wooOrderID, tracking.Status)
	s.pushToWoo(ctx, tracking)
	refreshed, err := s.repo.Get(ctx, siteID, tracking.ID)
	if err != nil {
		return tracking, nil
	}
	return refreshed, nil
}

func (s *Service) Refresh(ctx context.Context, siteID, trackingID string) (*ShipmentTracking, error) {
	tracking, err := s.repo.Get(ctx, siteID, trackingID)
	if err != nil {
		return nil, err
	}
	_ = s.repo.ApplyTrackingStatusToOrder(ctx, tracking.SiteID, tracking.SourcePlatform, tracking.WooOrderID, tracking.Status)
	s.pushToWoo(ctx, tracking)
	refreshed, err := s.repo.Get(ctx, siteID, trackingID)
	if err != nil {
		return tracking, nil
	}
	return refreshed, nil
}

func (s *Service) Delete(ctx context.Context, siteID, trackingID string) error {
	return s.repo.Delete(ctx, siteID, trackingID)
}

func (s *Service) SaveWCPushConfig(ctx context.Context, siteID string, req UpdateWCPushConfigRequest) error {
	pushURL := strings.TrimRight(strings.TrimSpace(req.PushURL), "/")
	pushToken := strings.TrimSpace(req.PushToken)
	if pushURL == "" || pushToken == "" {
		return errors.New("push_url and push_token are required")
	}
	encrypted, err := appCrypto.Encrypt(pushToken, s.encryptionKey)
	if err != nil {
		return err
	}
	return s.repo.SaveWCPushConfig(ctx, siteID, pushURL, encrypted)
}

func (s *Service) pushToWoo(ctx context.Context, tracking *ShipmentTracking) {
	site, err := s.sites.GetSiteByID(ctx, tracking.SiteID)
	if err != nil {
		_ = s.repo.MarkWCPushError(ctx, tracking.ID, err)
		return
	}
	if site.WCPushURL == "" || site.WCPushTokenEncrypted == "" {
		_ = s.repo.MarkWCPushError(ctx, tracking.ID, errors.New("WooCommerce push URL/token is not configured"))
		return
	}
	token, err := appCrypto.Decrypt(site.WCPushTokenEncrypted, s.encryptionKey)
	if err != nil {
		_ = s.repo.MarkWCPushError(ctx, tracking.ID, err)
		return
	}

	payload := WCPushPayload{
		TrackingNumber: tracking.TrackingNumber,
		CarrierName:    derefString(tracking.CarrierName),
		Status:         tracking.Status,
		TrackingURL:    derefString(tracking.TrackingURL),
	}
	if err := s.wcPush.PushTracking(ctx, site.WCPushURL, token, tracking.WooOrderID, payload); err != nil {
		_ = s.repo.MarkWCPushError(ctx, tracking.ID, err)
		return
	}
	_ = s.repo.MarkWCPushOK(ctx, tracking.ID)
}

func optionalString(v string) *string {
	v = strings.TrimSpace(v)
	if v == "" {
		return nil
	}
	return &v
}

func derefString(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}
