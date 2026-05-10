package sites

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/accnet/woosaas/api/internal/teams"
	"github.com/accnet/woosaas/api/pkg/models"
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// Site operations

func (r *Repository) CreateSite(ctx context.Context, userID, name, domain, timezone, currency string) (*models.Site, error) {
	site := &models.Site{
		ID:             uuid.New().String(),
		UserID:         userID,
		Name:           name,
		Domain:         domain,
		Timezone:       timezone,
		Currency:       currency,
		TrackingStatus: "pending",
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
	}

	_, err := r.db.Exec(ctx, `
		INSERT INTO sites (id, user_id, name, domain, timezone, currency, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, site.ID, site.UserID, site.Name, site.Domain, site.Timezone, site.Currency, site.CreatedAt, site.UpdatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to create site: %w", err)
	}

	// Create tracking verification record
	_, _ = r.db.Exec(ctx, `
		INSERT INTO tracking_verifications (site_id, status)
		VALUES ($1, 'pending')
	`, site.ID)

	_, _ = r.db.Exec(ctx, `
		INSERT INTO site_members (site_id, user_id, role)
		VALUES ($1, $2, 'owner')
		ON CONFLICT (site_id, user_id) DO NOTHING
	`, site.ID, site.UserID)

	return site, nil
}

func (r *Repository) GetSiteByID(ctx context.Context, id string) (*models.Site, error) {
	var site models.Site
	err := r.db.QueryRow(ctx, `
		SELECT
			s.id,
			s.user_id,
			s.name,
			s.domain,
			s.timezone,
			s.currency,
			COALESCE(tv.status, 'pending') AS tracking_status,
			tv.last_checked_at,
			tv.last_event_at,
			s.created_at,
			s.updated_at
		FROM sites s
		LEFT JOIN tracking_verifications tv ON tv.site_id = s.id
		WHERE s.id = $1
	`, id).Scan(
		&site.ID,
		&site.UserID,
		&site.Name,
		&site.Domain,
		&site.Timezone,
		&site.Currency,
		&site.TrackingStatus,
		&site.TrackingLastCheckedAt,
		&site.TrackingLastEventAt,
		&site.CreatedAt,
		&site.UpdatedAt,
	)

	if err != nil {
		return nil, err
	}

	return &site, nil
}

func (r *Repository) GetSitesByUserID(ctx context.Context, userID string) ([]models.Site, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			s.id,
			s.user_id,
			s.name,
			s.domain,
			s.timezone,
			s.currency,
			COALESCE(tv.status, 'pending') AS tracking_status,
			tv.last_checked_at,
			tv.last_event_at,
			s.created_at,
			s.updated_at
		FROM sites s
		LEFT JOIN tracking_verifications tv ON tv.site_id = s.id
		LEFT JOIN site_members sm ON sm.site_id = s.id AND sm.user_id = $1
		WHERE s.user_id = $1 OR sm.user_id = $1
		ORDER BY s.created_at DESC
	`, userID)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sites []models.Site
	for rows.Next() {
		var site models.Site
		if err := rows.Scan(
			&site.ID,
			&site.UserID,
			&site.Name,
			&site.Domain,
			&site.Timezone,
			&site.Currency,
			&site.TrackingStatus,
			&site.TrackingLastCheckedAt,
			&site.TrackingLastEventAt,
			&site.CreatedAt,
			&site.UpdatedAt,
		); err != nil {
			return nil, err
		}
		sites = append(sites, site)
	}

	return sites, nil
}

func (r *Repository) UpdateSite(ctx context.Context, id string, name, timezone, currency string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE sites SET name = $1, timezone = $2, currency = $3, updated_at = NOW()
		WHERE id = $4
	`, name, timezone, currency, id)

	return err
}

func (r *Repository) DeleteSite(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM sites WHERE id = $1`, id)
	return err
}

// API Key operations

func (r *Repository) CreateAPIKey(ctx context.Context, siteID, name string) (*models.APIKeyResponse, error) {
	// Generate API key
	keyBytes := make([]byte, 32)
	if _, err := rand.Read(keyBytes); err != nil {
		return nil, fmt.Errorf("failed to generate API key: %w", err)
	}
	apiKey := hex.EncodeToString(keyBytes)

	// Hash the key for storage
	hash := sha256.Sum256([]byte(apiKey))
	keyHash := hex.EncodeToString(hash[:])

	// Extract prefix (first 8 chars)
	keyPrefix := apiKey[:8]

	apiKeyRecord := &models.APIKey{
		ID:        uuid.New().String(),
		SiteID:    siteID,
		KeyHash:   keyHash,
		KeyPrefix: keyPrefix,
		Name:      name,
		Status:    "active",
		CreatedAt: time.Now(),
	}

	_, err := r.db.Exec(ctx, `
		INSERT INTO api_keys (id, site_id, key_hash, key_prefix, name, status, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, apiKeyRecord.ID, apiKeyRecord.SiteID, apiKeyRecord.KeyHash, apiKeyRecord.KeyPrefix, apiKeyRecord.Name, apiKeyRecord.Status, apiKeyRecord.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to create API key: %w", err)
	}

	return &models.APIKeyResponse{
		ID:        apiKeyRecord.ID,
		SiteID:    siteID,
		KeyPrefix: keyPrefix,
		Key:       apiKey,
		Name:      name,
		Status:    "active",
		CreatedAt: apiKeyRecord.CreatedAt,
	}, nil
}

func (r *Repository) GetAPIKeysBySiteID(ctx context.Context, siteID string) ([]models.APIKey, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, site_id, key_hash, key_prefix, name, status, last_used_at, created_at
		FROM api_keys WHERE site_id = $1
		ORDER BY created_at DESC
	`, siteID)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var keys []models.APIKey
	for rows.Next() {
		var key models.APIKey
		if err := rows.Scan(&key.ID, &key.SiteID, &key.KeyHash, &key.KeyPrefix, &key.Name, &key.Status, &key.LastUsedAt, &key.CreatedAt); err != nil {
			return nil, err
		}
		keys = append(keys, key)
	}

	return keys, nil
}

func (r *Repository) GetTrackingVerification(ctx context.Context, siteID string) (*models.TrackingVerification, error) {
	var verification models.TrackingVerification
	err := r.db.QueryRow(ctx, `
		SELECT site_id, status, last_checked_at, last_event_at, created_at, updated_at
		FROM tracking_verifications
		WHERE site_id = $1
	`, siteID).Scan(
		&verification.SiteID,
		&verification.Status,
		&verification.LastCheckedAt,
		&verification.LastEventAt,
		&verification.CreatedAt,
		&verification.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &verification, nil
}

func (r *Repository) MarkTrackingVerified(ctx context.Context, siteID string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE tracking_verifications
		SET status = 'verified', last_checked_at = NOW(), updated_at = NOW()
		WHERE site_id = $1
	`, siteID)
	return err
}

func (r *Repository) RecordTrackingEvent(ctx context.Context, siteID string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE tracking_verifications
		SET status = 'verified', last_event_at = NOW(), updated_at = NOW()
		WHERE site_id = $1
	`, siteID)
	return err
}

func hashAPIKey(apiKey string) string {
	hash := sha256.Sum256([]byte(apiKey))
	return hex.EncodeToString(hash[:])
}

func (r *Repository) ValidateAPIKey(ctx context.Context, apiKey string) (*models.Site, error) {
	// Hash the provided key
	keyHash := hashAPIKey(apiKey)

	var siteID string
	err := r.db.QueryRow(ctx, `
		SELECT site_id FROM api_keys WHERE key_hash = $1 AND status = 'active'
	`, keyHash).Scan(&siteID)

	if err != nil {
		return nil, err
	}

	// Update last used
	_, _ = r.db.Exec(ctx, `UPDATE api_keys SET last_used_at = NOW() WHERE key_hash = $1`, keyHash)

	// Get site info
	site, err := r.GetSiteByID(ctx, siteID)
	if err != nil {
		return nil, err
	}

	return site, nil
}

func (r *Repository) TouchAPIKeyLastUsedByHash(ctx context.Context, keyHash string) error {
	_, err := r.db.Exec(ctx, `UPDATE api_keys SET last_used_at = NOW() WHERE key_hash = $1`, keyHash)
	return err
}

func (r *Repository) RevokeAPIKey(ctx context.Context, keyID string) error {
	_, err := r.db.Exec(ctx, `UPDATE api_keys SET status = 'revoked' WHERE id = $1`, keyID)
	return err
}

// Check user has access to site
func (r *Repository) UserHasAccessToSite(ctx context.Context, userID, siteID string) (bool, error) {
	var count int
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM sites s
		LEFT JOIN site_members sm ON sm.site_id = s.id AND sm.user_id = $2
		WHERE s.id = $1 AND (s.user_id = $2 OR sm.user_id = $2)
	`, siteID, userID).Scan(&count)

	if err != nil {
		return false, err
	}

	return count > 0, nil
}

func (r *Repository) GetUserSiteRole(ctx context.Context, userID, siteID string) (string, error) {
	var role string
	err := r.db.QueryRow(ctx, `
		SELECT CASE
			WHEN s.user_id = $2 THEN 'owner'
			ELSE COALESCE(sm.role, '')
		END AS role
		FROM sites s
		LEFT JOIN site_members sm ON sm.site_id = s.id AND sm.user_id = $2
		WHERE s.id = $1 AND (s.user_id = $2 OR sm.user_id = $2)
	`, siteID, userID).Scan(&role)
	if err != nil {
		return "", err
	}
	return role, nil
}

func (r *Repository) UserHasSitePermission(ctx context.Context, userID, siteID, permission string) (bool, error) {
	role, err := r.GetUserSiteRole(ctx, userID, siteID)
	if err != nil {
		return false, err
	}
	return teams.HasPermission(role, permission), nil
}

func (r *Repository) ensureOwnerMembership(ctx context.Context, siteID string) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO site_members (site_id, user_id, role)
		SELECT id, user_id, 'owner'
		FROM sites
		WHERE id = $1
		ON CONFLICT (site_id, user_id) DO UPDATE SET role = 'owner'
	`, siteID)
	return err
}

func (r *Repository) GetSiteMembers(ctx context.Context, siteID string) ([]models.SiteMember, error) {
	if err := r.ensureOwnerMembership(ctx, siteID); err != nil {
		return nil, err
	}

	rows, err := r.db.Query(ctx, `
		SELECT sm.id, sm.site_id, sm.user_id, u.email, u.name, sm.role, sm.created_at
		FROM site_members sm
		INNER JOIN users u ON u.id = sm.user_id
		WHERE sm.site_id = $1
		ORDER BY
			CASE sm.role
				WHEN 'owner' THEN 0
				WHEN 'admin' THEN 1
				WHEN 'editor' THEN 2
				ELSE 3
			END,
			u.email ASC
	`, siteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []models.SiteMember
	for rows.Next() {
		var member models.SiteMember
		if err := rows.Scan(
			&member.ID,
			&member.SiteID,
			&member.UserID,
			&member.UserEmail,
			&member.UserName,
			&member.Role,
			&member.CreatedAt,
		); err != nil {
			return nil, err
		}
		members = append(members, member)
	}

	return members, rows.Err()
}

func (r *Repository) AddSiteMemberByEmail(ctx context.Context, siteID, email, role string) (*models.SiteMember, error) {
	if role == "owner" || !teams.IsValidRole(role) {
		return nil, fmt.Errorf("invalid role")
	}
	if err := r.ensureOwnerMembership(ctx, siteID); err != nil {
		return nil, err
	}

	var userID, userEmail, userName string
	err := r.db.QueryRow(ctx, `
		SELECT id, email, name FROM users WHERE email = $1
	`, email).Scan(&userID, &userEmail, &userName)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("user account not found")
		}
		return nil, err
	}

	if hasAccess, err := r.UserHasAccessToSite(ctx, userID, siteID); err == nil && hasAccess {
		return nil, fmt.Errorf("user already has access to this site")
	} else if err != nil {
		return nil, err
	}

	memberID := uuid.New().String()
	createdAt := time.Now()
	if _, err := r.db.Exec(ctx, `
		INSERT INTO site_members (id, site_id, user_id, role, created_at)
		VALUES ($1, $2, $3, $4, $5)
	`, memberID, siteID, userID, role, createdAt); err != nil {
		return nil, err
	}

	return &models.SiteMember{
		ID:        memberID,
		SiteID:    siteID,
		UserID:    userID,
		UserEmail: userEmail,
		UserName:  userName,
		Role:      role,
		CreatedAt: createdAt,
	}, nil
}

func (r *Repository) UpdateSiteMemberRole(ctx context.Context, siteID, memberID, role string) (*models.SiteMember, error) {
	if role == "owner" || !teams.IsValidRole(role) {
		return nil, fmt.Errorf("invalid role")
	}
	if err := r.ensureOwnerMembership(ctx, siteID); err != nil {
		return nil, err
	}

	var member models.SiteMember
	err := r.db.QueryRow(ctx, `
		SELECT sm.id, sm.site_id, sm.user_id, u.email, u.name, sm.role, sm.created_at
		FROM site_members sm
		INNER JOIN users u ON u.id = sm.user_id
		WHERE sm.site_id = $1 AND sm.id = $2
	`, siteID, memberID).Scan(
		&member.ID,
		&member.SiteID,
		&member.UserID,
		&member.UserEmail,
		&member.UserName,
		&member.Role,
		&member.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	if member.Role == "owner" {
		return nil, fmt.Errorf("owner role cannot be changed")
	}

	if _, err := r.db.Exec(ctx, `
		UPDATE site_members
		SET role = $1
		WHERE site_id = $2 AND id = $3
	`, role, siteID, memberID); err != nil {
		return nil, err
	}
	member.Role = role
	return &member, nil
}

func (r *Repository) RemoveSiteMember(ctx context.Context, siteID, memberID string) error {
	if err := r.ensureOwnerMembership(ctx, siteID); err != nil {
		return err
	}

	var role string
	err := r.db.QueryRow(ctx, `
		SELECT role
		FROM site_members
		WHERE site_id = $1 AND id = $2
	`, siteID, memberID).Scan(&role)
	if err != nil {
		return err
	}
	if role == "owner" {
		return fmt.Errorf("owner membership cannot be removed")
	}

	commandTag, err := r.db.Exec(ctx, `
		DELETE FROM site_members
		WHERE site_id = $1 AND id = $2
	`, siteID, memberID)
	if err != nil {
		return err
	}
	if commandTag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}

	return nil
}

// Domain validation helper
func ExtractDomain(url string) string {
	url = strings.TrimPrefix(url, "https://")
	url = strings.TrimPrefix(url, "http://")
	url = strings.TrimPrefix(url, "www.")
	if idx := strings.Index(url, "/"); idx > 0 {
		url = url[:idx]
	}
	return url
}
