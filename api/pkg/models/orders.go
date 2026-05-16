package models

import "time"

type WooOrderSyncRequest struct {
	Orders []WooOrderInput `json:"orders"`
}

type WooOrderSyncResponse struct {
	Accepted int             `json:"accepted"`
	Rejected int             `json:"rejected"`
	Skipped  int             `json:"skipped"`
	Reason   string          `json:"reason,omitempty"`
	Errors   []WooOrderError `json:"errors,omitempty"`
}

type WooOrderBackfillStateRequest struct {
	Status                 string  `json:"status"`
	LastBackfillModifiedAt *string `json:"last_backfill_modified_at,omitempty"`
	LastBackfillOrderID    *string `json:"last_backfill_order_id,omitempty"`
	BackfillCompletedAt    *string `json:"backfill_completed_at,omitempty"`
}

type WooOrderError struct {
	WooOrderID string `json:"woo_order_id,omitempty"`
	Error      string `json:"error"`
}

type WooOrderInput struct {
	WooOrderID        string                 `json:"woo_order_id"`
	WooCustomerID     string                 `json:"woo_customer_id"`
	SourcePlatform    string                 `json:"source_platform,omitempty"`
	ExternalOrderName string                 `json:"external_order_name,omitempty"`
	CheckoutToken     string                 `json:"checkout_token,omitempty"`
	CartToken         string                 `json:"cart_token,omitempty"`
	OrderStatusURL    string                 `json:"order_status_url,omitempty"`
	PaymentGateway    string                 `json:"payment_gateway,omitempty"`
	ReferringSite     string                 `json:"referring_site,omitempty"`
	Status            string                 `json:"status"`
	PaymentStatus     string                 `json:"payment_status"`
	FulfillmentStatus string                 `json:"fulfillment_status"`
	Currency          string                 `json:"currency"`
	TotalAmount       float64                `json:"total_amount"`
	SubtotalAmount    float64                `json:"subtotal_amount"`
	DiscountAmount    float64                `json:"discount_amount"`
	ShippingAmount    float64                `json:"shipping_amount"`
	TaxAmount         float64                `json:"tax_amount"`
	RefundAmount      float64                `json:"refund_amount"`
	ItemsCount        int                    `json:"items_count"`
	CustomerEmail     string                 `json:"customer_email"`
	CustomerFirstName string                 `json:"customer_first_name"`
	CustomerLastName  string                 `json:"customer_last_name"`
	CustomerPhone     string                 `json:"customer_phone"`
	BillingCompany    string                 `json:"billing_company"`
	BillingAddress    map[string]interface{} `json:"billing_address"`
	ShippingAddress   map[string]interface{} `json:"shipping_address"`
	ClientID          string                 `json:"client_id"`
	SessionID         string                 `json:"session_id"`
	Attribution       map[string]interface{} `json:"attribution"`
	CreatedAtWoo      *string                `json:"created_at_woo"`
	PaidAtWoo         *string                `json:"paid_at_woo"`
	CompletedAtWoo    *string                `json:"completed_at_woo"`
	ModifiedAtWoo     string                 `json:"modified_at_woo"`
	PurchaseTrackedAt *string                `json:"purchase_tracked_at,omitempty"`
	DeletedAtWoo      *string                `json:"deleted_at_woo,omitempty"`
	Items             []WooOrderItemInput    `json:"items"`
	RawOrder          map[string]interface{} `json:"raw_order"`
	DeliveryMethod    string                 `json:"delivery_method,omitempty"`
}

type WooOrderItemMeta struct {
	Key   string      `json:"key"`
	Value interface{} `json:"value"`
}

type WooOrderItemInput struct {
	LineItemID        string                 `json:"line_item_id"`
	ProductID         string                 `json:"product_id"`
	VariationID       string                 `json:"variation_id"`
	SKU               string                 `json:"sku"`
	Name              string                 `json:"name"`
	Quantity          int                    `json:"quantity"`
	UnitPrice         float64                `json:"unit_price"`
	LineSubtotal      float64                `json:"line_subtotal"`
	LineTotal         float64                `json:"line_total"`
	LineTax           float64                `json:"line_tax"`
	ThumbnailURL      string                 `json:"thumbnail_url,omitempty"`
	ImageURL          string                 `json:"image_url,omitempty"`
	ExternalVariantID string                 `json:"external_variant_id,omitempty"`
	VariantAttributes map[string]interface{} `json:"variant_attributes,omitempty"`
	Meta              []WooOrderItemMeta     `json:"meta,omitempty"`
}

type WooOrderListResponse struct {
	Orders     []WooOrderListItem `json:"orders"`
	TotalCount int                `json:"total_count"`
	Page       int                `json:"page"`
	PageSize   int                `json:"page_size"`
}

type WooOrderListItem struct {
	WooOrderID        string     `json:"woo_order_id"`
	SourcePlatform    string     `json:"source_platform"`
	CreatedAtWoo      *time.Time `json:"created_at_woo"`
	CustomerName      string     `json:"customer_name"`
	CustomerEmail     string     `json:"customer_email"`
	PaymentStatus     string     `json:"payment_status"`
	FulfillmentStatus string     `json:"fulfillment_status"`
	TotalAmount       float64    `json:"total_amount"`
	Currency          string     `json:"currency"`
	ItemsCount        int        `json:"items_count"`
	Status            string     `json:"status"`
	ContactID         *string    `json:"contact_id"`
	DeliveryMethod    string     `json:"delivery_method"`
	ShippingCity      string     `json:"shipping_city"`
	ShippingPostcode  string     `json:"shipping_postcode"`
	ShippingState     string     `json:"shipping_state"`
	ShippingCountry   string     `json:"shipping_country"`
}

type WooOrderItem struct {
	LineItemID        string                 `json:"line_item_id"`
	ProductID         string                 `json:"product_id"`
	VariationID       string                 `json:"variation_id"`
	SKU               string                 `json:"sku"`
	Name              string                 `json:"name"`
	Quantity          int                    `json:"quantity"`
	UnitPrice         float64                `json:"unit_price"`
	LineSubtotal      float64                `json:"line_subtotal"`
	LineTotal         float64                `json:"line_total"`
	LineTax           float64                `json:"line_tax"`
	ThumbnailURL      string                 `json:"thumbnail_url,omitempty"`
	ImageURL          string                 `json:"image_url,omitempty"`
	ExternalVariantID string                 `json:"external_variant_id,omitempty"`
	VariantAttributes map[string]interface{} `json:"variant_attributes,omitempty"`
	Meta              []WooOrderItemMeta     `json:"meta,omitempty"`
}

type WooOrderContact struct {
	ID              string                 `json:"id"`
	Email           string                 `json:"email"`
	Phone           string                 `json:"phone"`
	FullName        string                 `json:"full_name"`
	Company         string                 `json:"company"`
	OrdersCount     int                    `json:"orders_count"`
	TotalSpent      float64                `json:"total_spent"`
	FirstSeenAt     *time.Time             `json:"first_seen_at"`
	LastSeenAt      *time.Time             `json:"last_seen_at"`
	FirstName       string                 `json:"first_name,omitempty"`
	LastName        string                 `json:"last_name,omitempty"`
	WooCustomerID   string                 `json:"woo_customer_id,omitempty"`
	BillingAddress  map[string]interface{} `json:"billing_address,omitempty"`
	ShippingAddress map[string]interface{} `json:"shipping_address,omitempty"`
}

type WooOrderDetail struct {
	ID                string                 `json:"id"`
	SiteID            string                 `json:"site_id"`
	WooOrderID        string                 `json:"woo_order_id"`
	SourcePlatform    string                 `json:"source_platform"`
	WooCustomerID     string                 `json:"woo_customer_id"`
	Status            string                 `json:"status"`
	PaymentStatus     string                 `json:"payment_status"`
	FulfillmentStatus string                 `json:"fulfillment_status"`
	Currency          string                 `json:"currency"`
	TotalAmount       float64                `json:"total_amount"`
	SubtotalAmount    float64                `json:"subtotal_amount"`
	DiscountAmount    float64                `json:"discount_amount"`
	ShippingAmount    float64                `json:"shipping_amount"`
	TaxAmount         float64                `json:"tax_amount"`
	RefundAmount      float64                `json:"refund_amount"`
	ItemsCount        int                    `json:"items_count"`
	CustomerEmail     string                 `json:"customer_email"`
	CustomerFirstName string                 `json:"customer_first_name"`
	CustomerLastName  string                 `json:"customer_last_name"`
	CustomerPhone     string                 `json:"customer_phone"`
	BillingCompany    string                 `json:"billing_company"`
	BillingAddress    map[string]interface{} `json:"billing_address"`
	ShippingAddress   map[string]interface{} `json:"shipping_address"`
	ClientID          string                 `json:"client_id"`
	SessionID         string                 `json:"session_id"`
	Attribution       map[string]interface{} `json:"attribution"`
	ContactID         *string                `json:"contact_id"`
	CreatedAtWoo      *time.Time             `json:"created_at_woo"`
	PaidAtWoo         *time.Time             `json:"paid_at_woo"`
	CompletedAtWoo    *time.Time             `json:"completed_at_woo"`
	ModifiedAtWoo     time.Time              `json:"modified_at_woo"`
	DeletedAtWoo      *time.Time             `json:"deleted_at_woo"`
	SyncedAt          time.Time              `json:"synced_at"`
	CreatedAt         time.Time              `json:"created_at"`
	UpdatedAt         time.Time              `json:"updated_at"`
	RawOrder          map[string]interface{} `json:"raw_order"`
	Items             []WooOrderItem         `json:"items"`
	Contact           *WooOrderContact       `json:"contact"`
	DeliveryMethod    string                 `json:"delivery_method"`
}

type WooContactListResponse struct {
	Contacts   []WooOrderContact `json:"contacts"`
	TotalCount int               `json:"total_count"`
	Page       int               `json:"page"`
	PageSize   int               `json:"page_size"`
}

type WooOrderSyncState struct {
	SiteID                         string     `json:"site_id"`
	OrderSyncEnabled               bool       `json:"order_sync_enabled"`
	ContactSyncEnabled             bool       `json:"contact_sync_enabled"`
	AnalyticsPurchaseBridgeEnabled bool       `json:"analytics_purchase_bridge_enabled"`
	Status                         string     `json:"status"`
	LastBackfillModifiedAt         *time.Time `json:"last_backfill_modified_at"`
	LastBackfillOrderID            *string    `json:"last_backfill_order_id"`
	LastRealtimeSyncedAt           *time.Time `json:"last_realtime_synced_at"`
	LastSuccessAt                  *time.Time `json:"last_success_at"`
	LastError                      *string    `json:"last_error"`
	LastErrorAt                    *time.Time `json:"last_error_at"`
	BackfillCompletedAt            *time.Time `json:"backfill_completed_at"`
	CreatedAt                      time.Time  `json:"created_at"`
	UpdatedAt                      time.Time  `json:"updated_at"`
}
