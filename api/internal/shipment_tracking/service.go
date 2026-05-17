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

	s.registerWithTrackingMore(ctx, tracking)
	registered, err := s.repo.Get(ctx, siteID, tracking.ID)
	if err == nil {
		tracking = registered
	}
	_ = s.repo.ApplyTrackingStatusToOrder(ctx, siteID, SourcePlatformWooCommerce, wooOrderID, tracking.Status)
	s.pushToWoo(ctx, tracking)
	refreshed, err := s.repo.Get(ctx, siteID, tracking.ID)
	if err != nil {
		return tracking, nil
	}
	return refreshed, nil
}

func (s *Service) AddBatch(ctx context.Context, siteID string, req AddTrackingBatchRequest) (*AddTrackingBatchResponse, error) {
	if len(req.Trackings) == 0 {
		return nil, errors.New("trackings is required")
	}
	if len(req.Trackings) > 500 {
		return nil, errors.New("batch accepts at most 500 trackings")
	}

	resp := &AddTrackingBatchResponse{
		Created: make([]ShipmentTracking, 0, len(req.Trackings)),
		Errors:  make([]BatchError, 0),
	}
	for i, item := range req.Trackings {
		wooOrderID := strings.TrimSpace(item.WooOrderID)
		trackingNumber := strings.TrimSpace(item.TrackingNumber)
		if wooOrderID == "" || trackingNumber == "" {
			resp.Errors = append(resp.Errors, BatchError{Index: i, WooOrderID: wooOrderID, TrackingNumber: trackingNumber, Error: "woo_order_id and tracking_number are required"})
			continue
		}
		tracking, err := s.repo.Create(ctx, CreateTrackingInput{
			SiteID:         siteID,
			SourcePlatform: SourcePlatformWooCommerce,
			WooOrderID:     wooOrderID,
			TrackingNumber: trackingNumber,
			CarrierSlug:    optionalString(item.CarrierSlug),
			CarrierName:    optionalString(item.CarrierName),
			TrackingURL:    optionalString(item.TrackingURL),
			Provider:       ProviderManual,
			Status:         StatusFulfilled,
		})
		if err != nil {
			resp.Errors = append(resp.Errors, BatchError{Index: i, WooOrderID: wooOrderID, TrackingNumber: trackingNumber, Error: err.Error()})
			continue
		}
		_ = s.repo.ApplyTrackingStatusToOrder(ctx, siteID, SourcePlatformWooCommerce, wooOrderID, tracking.Status)
		resp.Created = append(resp.Created, *tracking)
	}
	s.registerBatchWithTrackingMore(ctx, resp.Created)
	for i := range resp.Created {
		refreshed, err := s.repo.Get(ctx, siteID, resp.Created[i].ID)
		if err == nil {
			resp.Created[i] = *refreshed
			s.pushToWoo(ctx, refreshed)
		}
	}
	return resp, nil
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

func (s *Service) ApplyTrackingMoreWebhook(ctx context.Context, raw []byte) ([]ShipmentTracking, error) {
	updates, err := ParseTrackingMoreWebhook(raw)
	if err != nil {
		return nil, err
	}
	applied := make([]ShipmentTracking, 0, len(updates))
	for _, update := range updates {
		tracking, err := s.repo.UpdateFromProvider(ctx, update)
		if err != nil {
			continue
		}
		_ = s.repo.ApplyTrackingStatusToOrder(ctx, tracking.SiteID, tracking.SourcePlatform, tracking.WooOrderID, tracking.Status)
		s.pushToWoo(ctx, tracking)
		applied = append(applied, *tracking)
	}
	return applied, nil
}

func (s *Service) TrackingMoreWebhookSecret(ctx context.Context) (string, error) {
	cfg, err := s.repo.GetProviderConfig(ctx, ProviderTrackingMore)
	if err != nil || cfg.WebhookSecretEncrypted == "" {
		return "", err
	}
	return appCrypto.Decrypt(cfg.WebhookSecretEncrypted, s.encryptionKey)
}

func (s *Service) registerWithTrackingMore(ctx context.Context, tracking *ShipmentTracking) {
	if tracking == nil {
		return
	}
	cfg, err := s.repo.GetProviderConfig(ctx, ProviderTrackingMore)
	if err != nil || !cfg.Enabled || cfg.APIKeyEncrypted == "" {
		return
	}
	if tracking.CarrierSlug == nil || strings.TrimSpace(*tracking.CarrierSlug) == "" {
		_ = s.repo.MarkSyncError(ctx, tracking.ID, errors.New("carrier_slug is required for TrackingMore registration"))
		return
	}
	apiKey, err := appCrypto.Decrypt(cfg.APIKeyEncrypted, s.encryptionKey)
	if err != nil {
		_ = s.repo.MarkSyncError(ctx, tracking.ID, err)
		return
	}
	result, err := NewTrackingMoreClient(cfg.BaseURL, apiKey).CreateTracking(ctx, TrackingMoreCreateInput{
		TrackingNumber: tracking.TrackingNumber,
		CarrierCode:    derefString(tracking.CarrierSlug),
		OrderID:        tracking.WooOrderID,
	})
	if err != nil {
		_ = s.repo.MarkSyncError(ctx, tracking.ID, err)
		return
	}
	_ = s.repo.MarkProviderRegistered(ctx, tracking.ID, result.ProviderTrackingID, result.StatusRaw, result.TrackingURL)
}

func (s *Service) registerBatchWithTrackingMore(ctx context.Context, trackings []ShipmentTracking) {
	cfg, err := s.repo.GetProviderConfig(ctx, ProviderTrackingMore)
	if err != nil || !cfg.Enabled || cfg.APIKeyEncrypted == "" {
		return
	}
	apiKey, err := appCrypto.Decrypt(cfg.APIKeyEncrypted, s.encryptionKey)
	if err != nil {
		for _, tracking := range trackings {
			_ = s.repo.MarkSyncError(ctx, tracking.ID, err)
		}
		return
	}
	client := NewTrackingMoreClient(cfg.BaseURL, apiKey)
	for start := 0; start < len(trackings); start += 40 {
		end := start + 40
		if end > len(trackings) {
			end = len(trackings)
		}
		chunk := trackings[start:end]
		inputs := make([]TrackingMoreCreateInput, 0, len(chunk))
		byKey := make(map[string]ShipmentTracking, len(chunk))
		for _, tracking := range chunk {
			if tracking.CarrierSlug == nil || strings.TrimSpace(*tracking.CarrierSlug) == "" {
				_ = s.repo.MarkSyncError(ctx, tracking.ID, errors.New("carrier_slug is required for TrackingMore batch registration"))
				continue
			}
			input := TrackingMoreCreateInput{
				TrackingNumber: tracking.TrackingNumber,
				CarrierCode:    derefString(tracking.CarrierSlug),
				OrderID:        tracking.WooOrderID,
			}
			inputs = append(inputs, input)
			byKey[trackingMoreBatchKey(input.TrackingNumber, input.CarrierCode)] = tracking
		}
		if len(inputs) == 0 {
			continue
		}
		results, err := client.CreateTrackingsBatch(ctx, inputs)
		if err != nil {
			for _, input := range inputs {
				if tracking, ok := byKey[trackingMoreBatchKey(input.TrackingNumber, input.CarrierCode)]; ok {
					_ = s.repo.MarkSyncError(ctx, tracking.ID, err)
				}
			}
			continue
		}
		for _, result := range results {
			tracking, ok := byKey[trackingMoreBatchKey(result.TrackingNumber, result.CarrierCode)]
			if !ok && result.TrackingNumber != "" {
				for _, candidate := range byKey {
					if candidate.TrackingNumber == result.TrackingNumber {
						tracking = candidate
						ok = true
						break
					}
				}
			}
			if !ok {
				continue
			}
			_ = s.repo.MarkProviderRegistered(ctx, tracking.ID, result.ProviderTrackingID, result.StatusRaw, result.TrackingURL)
		}
	}
}

func trackingMoreBatchKey(trackingNumber, carrierCode string) string {
	return strings.ToLower(strings.TrimSpace(carrierCode)) + ":" + strings.ToLower(strings.TrimSpace(trackingNumber))
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
