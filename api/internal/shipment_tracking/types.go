package shipment_tracking

import "time"

const (
	SourcePlatformWooCommerce = "woocommerce"
	ProviderManual            = "manual"
	StatusPending             = "pending"
	StatusFulfilled           = "fulfilled"
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
