package sites

import (
	"context"

	"github.com/accnet/woosaas/api/pkg/models"
)

// SiteRepository is the interface satisfied by Repository.
// Consumers that only need a subset should define their own minimal interface
// (see middleware.apiKeyValidator for an example).
type SiteRepository interface {
	// Site operations
	CreateSite(ctx context.Context, userID, name, domain, timezone, currency string) (*models.Site, error)
	GetSiteByID(ctx context.Context, id string) (*models.Site, error)
	GetSitesByUserID(ctx context.Context, userID string) ([]models.Site, error)
	UpdateSite(ctx context.Context, id, name, timezone, currency string) error
	DeleteSite(ctx context.Context, id string) error

	// API key operations
	CreateAPIKey(ctx context.Context, siteID, name string) (*models.APIKeyResponse, error)
	GetAPIKeysBySiteID(ctx context.Context, siteID string) ([]models.APIKey, error)
	ValidateAPIKey(ctx context.Context, apiKey string) (*models.Site, error)
	TouchAPIKeyLastUsedByHash(ctx context.Context, keyHash string) error
	RevokeAPIKey(ctx context.Context, keyID string) error

	// Tracking
	GetTrackingVerification(ctx context.Context, siteID string) (*models.TrackingVerification, error)
	MarkTrackingVerified(ctx context.Context, siteID string) error
	RecordTrackingEvent(ctx context.Context, siteID string) error

	// Access control
	UserHasAccessToSite(ctx context.Context, userID, siteID string) (bool, error)
	UserHasSitePermission(ctx context.Context, userID, siteID, permission string) (bool, error)
	GetUserSiteRole(ctx context.Context, userID, siteID string) (string, error)

	// Members
	GetSiteMembers(ctx context.Context, siteID string) ([]models.SiteMember, error)
	AddSiteMemberByEmail(ctx context.Context, siteID, email, role string) (*models.SiteMember, error)
	UpdateSiteMemberRole(ctx context.Context, siteID, memberID, role string) (*models.SiteMember, error)
	RemoveSiteMember(ctx context.Context, siteID, memberID string) error
}
