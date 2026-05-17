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

	"github.com/accnet/woosaas/api/pkg/models"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// Site operations

func (r *Repository) CreateSite(ctx context.Context, userID, name, domain, timezone, currency string) (*models.Site, error) {
	var activeSites, siteLimit int
	if err := r.db.QueryRow(ctx, `
		SELECT
			(SELECT COUNT(*) FROM sites WHERE user_id = $1 AND deleted_at IS NULL),
			COALESCE(p.site_limit, 1)
		FROM subscriptions sub
		INNER JOIN plans p ON p.id = sub.plan_id
		WHERE sub.user_id = $1
	`, userID).Scan(&activeSites, &siteLimit); err == nil && activeSites >= siteLimit {
		return nil, fmt.Errorf("site limit reached")
	}

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
			COALESCE(s.platform, ''),
			COALESCE(tv.status, 'pending') AS tracking_status,
			tv.last_checked_at,
			tv.last_event_at,
			COALESCE(s.wc_push_url, ''),
			COALESCE(s.wc_push_token_encrypted, ''),
			s.deleted_at,
			s.created_at,
			s.updated_at
		FROM sites s
		LEFT JOIN tracking_verifications tv ON tv.site_id = s.id
		WHERE s.id = $1 AND s.deleted_at IS NULL
	`, id).Scan(
		&site.ID,
		&site.UserID,
		&site.Name,
		&site.Domain,
		&site.Timezone,
		&site.Currency,
		&site.Platform,
		&site.TrackingStatus,
		&site.TrackingLastCheckedAt,
		&site.TrackingLastEventAt,
		&site.WCPushURL,
		&site.WCPushTokenEncrypted,
		&site.DeletedAt,
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
			COALESCE(s.platform, ''),
			COALESCE(tv.status, 'pending') AS tracking_status,
			tv.last_checked_at,
			tv.last_event_at,
			COALESCE(s.wc_push_url, ''),
			COALESCE(s.wc_push_token_encrypted, ''),
			s.deleted_at,
			s.created_at,
			s.updated_at
		FROM sites s
		LEFT JOIN tracking_verifications tv ON tv.site_id = s.id
		WHERE s.user_id = $1 AND s.deleted_at IS NULL
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
			&site.Platform,
			&site.TrackingStatus,
			&site.TrackingLastCheckedAt,
			&site.TrackingLastEventAt,
			&site.WCPushURL,
			&site.WCPushTokenEncrypted,
			&site.DeletedAt,
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
		WHERE id = $4 AND deleted_at IS NULL
	`, name, timezone, currency, id)

	return err
}

func (r *Repository) DeleteSite(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, `UPDATE sites SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL`, id)
	return err
}

func (r *Repository) ResetSiteData(ctx context.Context, id string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM shipment_trackings WHERE site_id = $1`, id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM commerce_order_items WHERE site_id = $1`, id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM commerce_orders WHERE site_id = $1`, id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM commerce_order_contacts WHERE site_id = $1`, id); err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, `
		UPDATE tracking_verifications
		SET status = 'pending', last_checked_at = NULL, last_event_at = NULL, updated_at = NOW()
		WHERE site_id = $1
	`, id); err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, `
		UPDATE commerce_order_sync_state
		SET status = 'idle',
			last_backfill_modified_at = NULL,
			last_backfill_order_id = NULL,
			last_realtime_synced_at = NULL,
			last_success_at = NULL,
			last_error = NULL,
			last_error_at = NULL,
			backfill_completed_at = NULL,
			updated_at = NOW()
		WHERE site_id = $1
	`, id); err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, `
		UPDATE shopbase_sync_state
		SET status = 'idle',
			last_order_updated_at = NULL,
			last_customer_updated_at = NULL,
			last_product_updated_at = NULL,
			last_webhook_at = NULL,
			last_success_at = NULL,
			last_error = NULL,
			last_error_at = NULL,
			backfill_completed_at = NULL,
			updated_at = NOW()
		WHERE site_id = $1
	`, id); err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, `UPDATE sites SET updated_at = NOW() WHERE id = $1`, id); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// API Key operations

const ShopBaseTrackingAPIKeyName = "ShopBase tracking script"

func (r *Repository) CreateAPIKey(ctx context.Context, siteID, name string) (*models.APIKeyResponse, error) {
	return r.createAPIKey(ctx, siteID, name, true)
}

func (r *Repository) CreateTrackingAPIKey(ctx context.Context, siteID, name string) (*models.APIKeyResponse, error) {
	return r.createAPIKey(ctx, siteID, name, false)
}

func (r *Repository) createAPIKey(ctx context.Context, siteID, name string, revokeExisting bool) (*models.APIKeyResponse, error) {
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

	if revokeExisting {
		// Revoke user-managed keys for this site first (only 1 active key per site).
		// The ShopBase storefront tracker uses its own public write key and must
		// keep working when a user rotates their manual integration key.
		_, err := r.db.Exec(ctx, `
			UPDATE api_keys
			SET status = 'revoked'
			WHERE site_id = $1 AND name <> $2
		`, siteID, ShopBaseTrackingAPIKeyName)
		if err != nil {
			return nil, fmt.Errorf("failed to revoke existing API keys: %w", err)
		}
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
		FROM api_keys WHERE site_id = $1 AND status = 'active' AND name <> $2
		ORDER BY created_at DESC
	`, siteID, ShopBaseTrackingAPIKeyName)

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
		SELECT ak.site_id
		FROM api_keys ak
		INNER JOIN sites s ON s.id = ak.site_id
		WHERE ak.key_hash = $1
		  AND ak.status = 'active'
		  AND s.deleted_at IS NULL
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
		WHERE s.id = $1 AND s.user_id = $2 AND s.deleted_at IS NULL
	`, siteID, userID).Scan(&count)

	if err != nil {
		return false, err
	}

	return count > 0, nil
}

func (r *Repository) GetUserSiteRole(ctx context.Context, userID, siteID string) (string, error) {
	var role string
	err := r.db.QueryRow(ctx, `
		SELECT COALESCE(um.role, '')
		FROM sites s
		INNER JOIN users_members um ON um.user_id = s.user_id
		WHERE s.id = $1
		  AND s.user_id = $2
		  AND s.deleted_at IS NULL
		  AND um.status = 'active'
		ORDER BY CASE um.role
			WHEN 'owner' THEN 0
			WHEN 'admin' THEN 1
			WHEN 'member' THEN 2
			WHEN 'billing' THEN 3
			ELSE 4
		END
		LIMIT 1
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
	return accountRoleHasPermission(role, permission), nil
}

func (r *Repository) ensureOwnerMembership(ctx context.Context, siteID string) error {
	return nil
}

func (r *Repository) GetSiteMembers(ctx context.Context, siteID string) ([]models.SiteMember, error) {
	rows, err := r.db.Query(ctx, `
		SELECT um.id, s.id, um.user_id, um.email, COALESCE(um.full_name, ''), um.role, um.created_at
		FROM sites s
		INNER JOIN users_members um ON um.user_id = s.user_id
		WHERE s.id = $1 AND s.deleted_at IS NULL
		ORDER BY
			CASE um.role
				WHEN 'owner' THEN 0
				WHEN 'admin' THEN 1
				WHEN 'member' THEN 2
				WHEN 'billing' THEN 3
				ELSE 3
			END,
			um.email ASC
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
	if role == "owner" || !isValidAccountRole(role) {
		return nil, fmt.Errorf("invalid role")
	}

	var accountID string
	err := r.db.QueryRow(ctx, `
		SELECT user_id FROM sites WHERE id = $1 AND deleted_at IS NULL
	`, siteID).Scan(&accountID)
	if err != nil {
		return nil, err
	}

	var member models.SiteMember
	err = r.db.QueryRow(ctx, `
		UPDATE users_members
		SET role = $3, updated_at = NOW()
		WHERE user_id = $1 AND LOWER(email) = LOWER($2)
		RETURNING id, $4::uuid, user_id, email, COALESCE(full_name, ''), role, created_at
	`, accountID, email, role, siteID).Scan(
		&member.ID,
		&member.SiteID,
		&member.UserID,
		&member.UserEmail,
		&member.UserName,
		&member.Role,
		&member.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("member account not found")
		}
		return nil, err
	}

	return &member, nil
}

func (r *Repository) UpdateSiteMemberRole(ctx context.Context, siteID, memberID, role string) (*models.SiteMember, error) {
	if role == "owner" || !isValidAccountRole(role) {
		return nil, fmt.Errorf("invalid role")
	}

	var member models.SiteMember
	err := r.db.QueryRow(ctx, `
		UPDATE users_members um
		SET role = $3, updated_at = NOW()
		FROM sites s
		WHERE s.id = $1
		  AND s.deleted_at IS NULL
		  AND s.user_id = um.user_id
		  AND um.id = $2
		  AND um.role <> 'owner'
		RETURNING um.id, s.id, um.user_id, um.email, COALESCE(um.full_name, ''), um.role, um.created_at
	`, siteID, memberID, role).Scan(
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
	return &member, nil
}

func (r *Repository) RemoveSiteMember(ctx context.Context, siteID, memberID string) error {
	commandTag, err := r.db.Exec(ctx, `
		UPDATE users_members um
		SET status = 'disabled', updated_at = NOW()
		FROM sites s
		WHERE s.id = $1
		  AND s.deleted_at IS NULL
		  AND s.user_id = um.user_id
		  AND um.id = $2
		  AND um.role <> 'owner'
	`, siteID, memberID)
	if err != nil {
		return err
	}
	if commandTag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}

	return nil
}

func isValidAccountRole(role string) bool {
	switch role {
	case "admin", "member", "billing", "viewer":
		return true
	default:
		return false
	}
}

func accountRoleHasPermission(role, permission string) bool {
	switch role {
	case "owner":
		return true
	case "admin":
		switch permission {
		case "site:read", "site:write", "site:delete", "api_keys:read", "api_keys:write", "members:read", "members:write", "users:read", "users:write", "users:delete":
			return true
		}
	case "member":
		switch permission {
		case "site:read", "site:write", "api_keys:read":
			return true
		}
	case "billing":
		return permission == "billing:read" || permission == "billing:write" || permission == "site:read"
	case "viewer":
		return permission == "site:read" || permission == "api_keys:read" || permission == "members:read" || permission == "users:read"
	}
	return false
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
