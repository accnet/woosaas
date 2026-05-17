package models

import (
	"encoding/json"
	"time"
)

// User represents a dashboard user
type User struct {
	ID           string     `json:"id" db:"id"`
	Email        string     `json:"email" db:"email"`
	PasswordHash string     `json:"-" db:"password_hash"`
	Name         string     `json:"name" db:"name"`
	Status       string     `json:"status,omitempty" db:"status"`
	DeletedAt    *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
	CreatedAt    time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at" db:"updated_at"`
}

// UserMember represents a human login attached to a tenant account.
type UserMember struct {
	ID           string     `json:"id" db:"id"`
	UserID       string     `json:"user_id" db:"user_id"`
	Email        string     `json:"email" db:"email"`
	PasswordHash string     `json:"-" db:"password_hash"`
	FullName     string     `json:"full_name" db:"full_name"`
	Role         string     `json:"role" db:"role"`
	Status       string     `json:"status" db:"status"`
	LastLoginAt  *time.Time `json:"last_login_at,omitempty" db:"last_login_at"`
	CreatedAt    time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at" db:"updated_at"`
}

// Site represents a tracked website
type Site struct {
	ID                    string     `json:"id" db:"id"`
	UserID                string     `json:"user_id" db:"user_id"`
	Name                  string     `json:"name" db:"name"`
	Domain                string     `json:"domain" db:"domain"`
	Timezone              string     `json:"timezone" db:"timezone"`
	Currency              string     `json:"currency" db:"currency"`
	Platform              string     `json:"platform" db:"platform"`
	ExternalShopID        string     `json:"external_shop_id,omitempty" db:"external_shop_id"`
	PlatformDomain        string     `json:"platform_domain,omitempty" db:"platform_domain"`
	PrimaryDomain         string     `json:"primary_domain,omitempty" db:"primary_domain"`
	TrackingStatus        string     `json:"tracking_status" db:"tracking_status"`
	TrackingLastCheckedAt *time.Time `json:"tracking_last_checked_at" db:"tracking_last_checked_at"`
	TrackingLastEventAt   *time.Time `json:"tracking_last_event_at" db:"tracking_last_event_at"`
	WCPushURL             string     `json:"wc_push_url,omitempty" db:"wc_push_url"`
	WCPushTokenEncrypted  string     `json:"-" db:"wc_push_token_encrypted"`
	DeletedAt             *time.Time `json:"deleted_at,omitempty" db:"deleted_at"`
	CreatedAt             time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt             time.Time  `json:"updated_at" db:"updated_at"`
}

// APIKey represents an API key for a site
type APIKey struct {
	ID         string     `json:"id" db:"id"`
	SiteID     string     `json:"site_id" db:"site_id"`
	KeyHash    string     `json:"-" db:"key_hash"`
	KeyPrefix  string     `json:"key_prefix" db:"key_prefix"`
	Name       string     `json:"name" db:"name"`
	Status     string     `json:"status" db:"status"`
	LastUsedAt *time.Time `json:"last_used_at" db:"last_used_at"`
	CreatedAt  time.Time  `json:"created_at" db:"created_at"`
}

// APIKeyResponse is the API key response with the actual key (only shown once)
type APIKeyResponse struct {
	ID        string    `json:"id"`
	SiteID    string    `json:"site_id"`
	KeyPrefix string    `json:"key_prefix"`
	Key       string    `json:"key"` // Only returned once on creation
	Name      string    `json:"name"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

type SiteMember struct {
	ID        string    `json:"id"`
	SiteID    string    `json:"site_id"`
	UserID    string    `json:"user_id"`
	UserEmail string    `json:"user_email"`
	UserName  string    `json:"user_name"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

type SiteMembersResponse struct {
	Members                []SiteMember `json:"members"`
	CurrentUserRole        string       `json:"current_user_role"`
	CurrentUserPermissions []string     `json:"current_user_permissions"`
}

type TrackingVerification struct {
	SiteID        string     `json:"site_id"`
	Status        string     `json:"status"`
	LastCheckedAt *time.Time `json:"last_checked_at"`
	LastEventAt   *time.Time `json:"last_event_at"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

// Attribution data
type Attribution struct {
	Source   string `json:"source,omitempty"`
	Medium   string `json:"medium,omitempty"`
	Campaign string `json:"campaign,omitempty"`
	Term     string `json:"term,omitempty"`
	Content  string `json:"content,omitempty"`
	GCLID    string `json:"gclid,omitempty"`
	FBCLID   string `json:"fbclid,omitempty"`
	TTCLID   string `json:"ttclid,omitempty"`
	MSCLKID  string `json:"msclkid,omitempty"`
}

// Event represents an analytics event
type Event struct {
	EventID   string `json:"event_id" validate:"required,uuid"`
	EventTime string `json:"event_time" validate:"required"`
	EventName string `json:"event_name" validate:"required"`
	ClientID  string `json:"client_id" validate:"required"`
	SessionID string `json:"session_id" validate:"required"`
	URL       string `json:"url"`
	Path      string `json:"path"`
	Referrer  string `json:"referrer"`

	Attribution *Attribution `json:"attribution,omitempty"`

	UserID     string `json:"user_id,omitempty"`
	DeviceType string `json:"device_type,omitempty"`
	Browser    string `json:"browser,omitempty"`
	OS         string `json:"os,omitempty"`
	Country    string `json:"country,omitempty"`
	City       string `json:"city,omitempty"`
	UserAgent  string `json:"user_agent,omitempty"`
	IPHash     string `json:"ip_hash,omitempty"`

	OrderID     string                 `json:"order_id,omitempty"`
	ProductID   string                 `json:"product_id,omitempty"`
	ProductName string                 `json:"product_name,omitempty"`
	Quantity    uint32                 `json:"quantity,omitempty"`
	Revenue     float64                `json:"revenue,omitempty"`
	Currency    string                 `json:"currency,omitempty"`
	ItemsJSON   string                 `json:"items_json,omitempty"`
	Properties  map[string]interface{} `json:"properties,omitempty"`

	BotScore  int    `json:"bot_score,omitempty"`
	BotReason string `json:"bot_reason,omitempty"`
}

// BatchEventRequest for batch event ingestion
type BatchEventRequest struct {
	Events []Event `json:"events" validate:"required,min=1,max=1000,dive"`
}

// EventResponse for API responses
type EventResponse struct {
	EventID    string `json:"event_id"`
	Status     string `json:"status"`
	ReceivedAt string `json:"received_at"`
}

// VerifyResponse for verify endpoint
type VerifyResponse struct {
	Valid   bool   `json:"valid"`
	SiteID  string `json:"site_id,omitempty"`
	Domain  string `json:"domain,omitempty"`
	Message string `json:"message,omitempty"`
}

// RegisterRequest for user registration
type RegisterRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required,min=8"`
	Name     string `json:"name" validate:"required,min=2"`
}

// LoginRequest for user login
type LoginRequest struct {
	Email    string `json:"email" validate:"required,email"`
	Password string `json:"password" validate:"required"`
}

type UpdateProfileRequest struct {
	Name string `json:"name" validate:"required,min=1,max=255"`
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" validate:"required"`
	NewPassword     string `json:"new_password" validate:"required,min=8"`
}

// AuthResponse for auth responses
type AuthResponse struct {
	Token   string     `json:"token"`
	User    User       `json:"user"`
	Account User       `json:"account"`
	Member  UserMember `json:"member"`
}

// CreateSiteRequest for creating a new site
type CreateSiteRequest struct {
	Name     string `json:"name" validate:"required,min=2"`
	Domain   string `json:"domain" validate:"required,url"`
	Timezone string `json:"timezone,omitempty"`
	Currency string `json:"currency,omitempty"`
}

// UpdateSiteRequest for updating a site
type UpdateSiteRequest struct {
	Name     string `json:"name,omitempty"`
	Timezone string `json:"timezone,omitempty"`
	Currency string `json:"currency,omitempty"`
}

// CreateAPIKeyRequest for creating a new API key
type CreateAPIKeyRequest struct {
	Name string `json:"name" validate:"required,min=2"`
}

type CreateSiteMemberRequest struct {
	Email string `json:"email" validate:"required,email"`
	Role  string `json:"role" validate:"required"`
}

type UpdateSiteMemberRequest struct {
	Role string `json:"role" validate:"required"`
}

type DebugEventRequest struct {
	EventName string `json:"event_name" validate:"required"`
}

type UserSettings struct {
	UserID           string    `json:"user_id"`
	Timezone         string    `json:"timezone"`
	Currency         string    `json:"currency"`
	DefaultDateRange string    `json:"default_date_range"`
	DashboardDensity string    `json:"dashboard_density"`
	LandingPage      string    `json:"landing_page"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

type UpdateUserSettingsRequest struct {
	Timezone         string `json:"timezone,omitempty"`
	Currency         string `json:"currency,omitempty"`
	DefaultDateRange string `json:"default_date_range,omitempty"`
	DashboardDensity string `json:"dashboard_density,omitempty"`
	LandingPage      string `json:"landing_page,omitempty"`
}

type BillingProfile struct {
	BillingName  string    `json:"billing_name"`
	Company      string    `json:"company"`
	Email        string    `json:"email"`
	Phone        string    `json:"phone"`
	TaxID        string    `json:"tax_id"`
	AddressLine1 string    `json:"address_line1"`
	AddressLine2 string    `json:"address_line2"`
	City         string    `json:"city"`
	State        string    `json:"state"`
	PostalCode   string    `json:"postal_code"`
	Country      string    `json:"country"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Invoice struct {
	ID            string     `json:"id"`
	InvoiceNumber string     `json:"invoice_number"`
	Status        string     `json:"status"`
	AmountCents   int64      `json:"amount_cents"`
	Currency      string     `json:"currency"`
	IssuedAt      *time.Time `json:"issued_at"`
	DueAt         *time.Time `json:"due_at"`
	PaidAt        *time.Time `json:"paid_at"`
	HostedURL     string     `json:"hosted_url"`
	PDFURL        string     `json:"pdf_url"`
	CreatedAt     time.Time  `json:"created_at"`
}

// TemplateColumnType distinguishes between data-mapped and static custom columns.
const (
	TemplateColumnOrderField = "order_field"
	TemplateColumnCustom     = "custom"
)

// TemplateColumn is one column definition inside an ExportTemplate.
// type="order_field": key maps to a known order field from ColumnRegistry.
// type="custom": no data mapping; default_value is written to every row (can be empty).
type TemplateColumn struct {
	Type         string `json:"type"`                    // "order_field" | "custom"
	Key          string `json:"key,omitempty"`           // only set when type = "order_field"
	Label        string `json:"label"`                   // CSV header label (required, fully customisable)
	DefaultValue string `json:"default_value,omitempty"` // only used when type = "custom"
}

// ExportTemplate is a named, ordered list of columns used when exporting orders to CSV.
type ExportTemplate struct {
	ID          string           `json:"id"`
	SiteID      string           `json:"site_id"`
	Name        string           `json:"name"`
	Description string           `json:"description"`
	Columns     []TemplateColumn `json:"columns"`
	IsSystem    bool             `json:"is_system"`
	IsDefault   bool             `json:"is_default"`
	CreatedAt   time.Time        `json:"created_at"`
	UpdatedAt   time.Time        `json:"updated_at"`
}

type CreateExportTemplateRequest struct {
	Name        string           `json:"name"`
	Description string           `json:"description"`
	Columns     []TemplateColumn `json:"columns"`
}

type UpdateExportTemplateRequest struct {
	Name        string           `json:"name"`
	Description string           `json:"description"`
	Columns     []TemplateColumn `json:"columns"`
}

// ErrorResponse for error responses
type ErrorResponse struct {
	Error   string `json:"error"`
	Code    string `json:"code,omitempty"`
	Details string `json:"details,omitempty"`
}

// StatsQuery for common query parameters
type StatsQuery struct {
	SiteID   string `form:"site_id" validate:"required,uuid"`
	From     string `form:"from" validate:"required"`
	To       string `form:"to" validate:"required"`
	Timezone string `form:"timezone" validate:"required"`
}

// JSON converts Event to JSON string for ClickHouse storage
func (e *Event) JSON() (string, error) {
	data, err := json.Marshal(e)
	if err != nil {
		return "", err
	}
	return string(data), nil
}
