package models

import (
	"encoding/json"
	"time"
)

// User represents a dashboard user
type User struct {
	ID           string    `json:"id" db:"id"`
	Email        string    `json:"email" db:"email"`
	PasswordHash string    `json:"-" db:"password_hash"`
	Name         string    `json:"name" db:"name"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time `json:"updated_at" db:"updated_at"`
}

// Site represents a tracked website
type Site struct {
	ID        string    `json:"id" db:"id"`
	UserID    string    `json:"user_id" db:"user_id"`
	Name      string    `json:"name" db:"name"`
	Domain    string    `json:"domain" db:"domain"`
	Timezone  string    `json:"timezone" db:"timezone"`
	Currency  string    `json:"currency" db:"currency"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
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
	EventID   string      `json:"event_id" validate:"required,uuid"`
	EventTime string      `json:"event_time" validate:"required"`
	EventName string      `json:"event_name" validate:"required"`
	ClientID  string      `json:"client_id" validate:"required"`
	SessionID string      `json:"session_id" validate:"required"`
	URL       string      `json:"url"`
	Path      string      `json:"path"`
	Referrer  string      `json:"referrer"`
	
	Attribution *Attribution `json:"attribution,omitempty"`
	
	UserID   string                 `json:"user_id,omitempty"`
	DeviceType string               `json:"device_type,omitempty"`
	Browser    string               `json:"browser,omitempty"`
	OS         string               `json:"os,omitempty"`
	Country    string               `json:"country,omitempty"`
	City       string               `json:"city,omitempty"`
	UserAgent  string               `json:"user_agent,omitempty"`
	IPHash     string               `json:"ip_hash,omitempty"`

	OrderID     string                 `json:"order_id,omitempty"`
	ProductID   string                 `json:"product_id,omitempty"`
	ProductName string                 `json:"product_name,omitempty"`
	Quantity    uint32                 `json:"quantity,omitempty"`
	Revenue     float64                `json:"revenue,omitempty"`
	Currency    string                 `json:"currency,omitempty"`
	ItemsJSON   string                 `json:"items_json,omitempty"`
	Properties  map[string]interface{} `json:"properties,omitempty"`

	BotScore int    `json:"bot_score,omitempty"`
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

// AuthResponse for auth responses
type AuthResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
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