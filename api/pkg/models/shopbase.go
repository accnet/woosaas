package models

import "time"

// SiteIntegration holds connection info for a platform integration.
// Encrypted credential fields are never serialized to JSON.
type SiteIntegration struct {
	ID             string     `json:"id"`
	SiteID         string     `json:"site_id"`
	Platform       string     `json:"platform"`
	AuthType       string     `json:"auth_type"`
	ShopDomain     string     `json:"shop_domain"`
	Status         string     `json:"status"`
	LastVerifiedAt *time.Time `json:"last_verified_at,omitempty"`
	LastError      string     `json:"last_error,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

// ShopBaseSyncState tracks backfill and webhook sync state per site.
type ShopBaseSyncState struct {
	SiteID                string     `json:"site_id"`
	OrderSyncEnabled      bool       `json:"order_sync_enabled"`
	CheckoutSyncEnabled   bool       `json:"checkout_sync_enabled"`
	CustomerSyncEnabled   bool       `json:"customer_sync_enabled"`
	ProductSyncEnabled    bool       `json:"product_sync_enabled"`
	Status                string     `json:"status"`
	LastOrderUpdatedAt    *time.Time `json:"last_order_updated_at,omitempty"`
	LastCustomerUpdatedAt *time.Time `json:"last_customer_updated_at,omitempty"`
	LastProductUpdatedAt  *time.Time `json:"last_product_updated_at,omitempty"`
	LastWebhookAt         *time.Time `json:"last_webhook_at,omitempty"`
	LastSuccessAt         *time.Time `json:"last_success_at,omitempty"`
	LastError             string     `json:"last_error,omitempty"`
	LastErrorAt           *time.Time `json:"last_error_at,omitempty"`
	BackfillCompletedAt   *time.Time `json:"backfill_completed_at,omitempty"`
	CreatedAt             time.Time  `json:"created_at"`
	UpdatedAt             time.Time  `json:"updated_at"`
}

// ShopMetadata is returned after verifying a ShopBase store.
type ShopMetadata struct {
	ExternalShopID string `json:"external_shop_id"`
	Name           string `json:"name"`
	Domain         string `json:"domain"` // myshop.onshopbase.com
	PlatformDomain string `json:"platform_domain"`
	PrimaryDomain  string `json:"primary_domain,omitempty"` // custom domain if set
	Currency       string `json:"currency"`
	Timezone       string `json:"timezone"`
	Country        string `json:"country,omitempty"`
}

// SyncOptions lets the user choose which data types to sync.
type SyncOptions struct {
	Orders    bool `json:"orders"`
	Customers bool `json:"customers"`
	Products  bool `json:"products"`
}

// ShopBaseVerifyRequest verifies credentials before creating a site.
type ShopBaseVerifyRequest struct {
	ShopDomain  string `json:"shop_domain" binding:"required"`
	APIKey      string `json:"api_key" binding:"required"`
	APIPassword string `json:"api_password" binding:"required"`
}

// ShopBaseVerifyResponse returns shop info if credentials are valid.
type ShopBaseVerifyResponse struct {
	OK   bool         `json:"ok"`
	Shop ShopMetadata `json:"shop"`
}

// ShopBaseConnectRequest creates a new ShopBase site.
type ShopBaseConnectRequest struct {
	ShopDomain  string      `json:"shop_domain" binding:"required"`
	APIKey      string      `json:"api_key" binding:"required"`
	APIPassword string      `json:"api_password" binding:"required"`
	SyncOptions SyncOptions `json:"sync_options"`
}

// ShopBaseIntegrationStatus is returned by the health/status endpoint.
type ShopBaseIntegrationStatus struct {
	Platform   string             `json:"platform"`
	Status     string             `json:"status"`
	ShopDomain string             `json:"shop_domain"`
	ScriptTag  ScriptTagStatus    `json:"script_tag"`
	Webhooks   WebhookStatus      `json:"webhooks"`
	SyncState  *ShopBaseSyncState `json:"sync_state,omitempty"`
}

// ScriptTagStatus reports tracking script install state.
type ScriptTagStatus struct {
	Installed bool   `json:"installed"`
	Reason    string `json:"reason,omitempty"`
	ID        int64  `json:"script_tag_id,omitempty"`
	Src       string `json:"src,omitempty"`
}

// WebhookStatus reports webhook registration state.
type WebhookStatus struct {
	Registered int      `json:"registered"`
	Missing    []string `json:"missing"`
}

// ShopBaseBackfillRequest triggers a backfill job.
type ShopBaseBackfillRequest struct {
	Type string `json:"type"` // "orders", "customers", "products", or "all"
}
