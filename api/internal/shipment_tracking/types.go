package shipment_tracking

import "time"

const (
	SourcePlatformWooCommerce = "woocommerce"
	ProviderManual            = "manual"
	ProviderTrackingMore      = "trackingmore"
	StatusPending             = "pending"
	StatusFulfilled           = "fulfilled"
	StatusInTransit           = "in_transit"
	StatusOutForDelivery      = "out_for_delivery"
	StatusDelivered           = "delivered"
	StatusException           = "exception"
	StatusFailedDelivery      = "failed_delivery"
	StatusReturned            = "returned"
	WCPushStatusOK            = "ok"
	WCPushStatusError         = "error"
)

type ShipmentTracking struct {
	ID                 string     `json:"id"`
	SiteID             string     `json:"site_id"`
	SourcePlatform     string     `json:"source_platform"`
	WooOrderID         string     `json:"woo_order_id"`
	TrackingNumber     string     `json:"tracking_number"`
	CarrierSlug        *string    `json:"carrier_slug"`
	CarrierName        *string    `json:"carrier_name"`
	Provider           string     `json:"provider"`
	ProviderTrackingID *string    `json:"provider_tracking_id"`
	Status             string     `json:"status"`
	StatusRaw          *string    `json:"status_raw"`
	TrackingURL        *string    `json:"tracking_url"`
	LastCheckpointAt   *time.Time `json:"last_checkpoint_at"`
	LastSyncedAt       *time.Time `json:"last_synced_at"`
	SyncError          *string    `json:"sync_error"`
	WCPushStatus       *string    `json:"wc_push_status"`
	WCPushError        *string    `json:"wc_push_error"`
	WCPushedAt         *time.Time `json:"wc_pushed_at"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

type AddTrackingRequest struct {
	TrackingNumber string `json:"tracking_number"`
	CarrierSlug    string `json:"carrier_slug,omitempty"`
	CarrierName    string `json:"carrier_name,omitempty"`
	TrackingURL    string `json:"tracking_url,omitempty"`
}

type BatchTrackingItem struct {
	WooOrderID     string `json:"woo_order_id"`
	TrackingNumber string `json:"tracking_number"`
	CarrierSlug    string `json:"carrier_slug"`
	CarrierName    string `json:"carrier_name,omitempty"`
	TrackingURL    string `json:"tracking_url,omitempty"`
}

type AddTrackingBatchRequest struct {
	Trackings []BatchTrackingItem `json:"trackings"`
}

type AddTrackingBatchResponse struct {
	Created []ShipmentTracking `json:"created"`
	Errors  []BatchError       `json:"errors"`
}

type BatchError struct {
	Index          int    `json:"index"`
	WooOrderID     string `json:"woo_order_id,omitempty"`
	TrackingNumber string `json:"tracking_number,omitempty"`
	Error          string `json:"error"`
}

type UpdateWCPushConfigRequest struct {
	PushURL   string `json:"push_url"`
	PushToken string `json:"push_token"`
}

type CreateTrackingInput struct {
	SiteID         string
	SourcePlatform string
	WooOrderID     string
	TrackingNumber string
	CarrierSlug    *string
	CarrierName    *string
	TrackingURL    *string
	Provider       string
	Status         string
}

type ProviderConfig struct {
	ID                     string
	Enabled                bool
	BaseURL                string
	APIKeyEncrypted        string
	WebhookSecretEncrypted string
}

type ProviderStatusUpdate struct {
	Provider           string
	ProviderTrackingID string
	TrackingNumber     string
	CarrierSlug        string
	Status             string
	StatusRaw          string
	TrackingURL        string
	LastCheckpointAt   *time.Time
	RawPayload         []byte
}
