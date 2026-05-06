package sites

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/woosaas/api/pkg/models"
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// User operations

func (r *Repository) CreateUser(ctx context.Context, email, passwordHash, name string) (*models.User, error) {
	user := &models.User{
		ID:           uuid.New().String(),
		Email:        email,
		PasswordHash: passwordHash,
		Name:         name,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}

	_, err := r.db.Exec(ctx, `
		INSERT INTO users (id, email, password_hash, name, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, user.ID, user.Email, user.PasswordHash, user.Name, user.CreatedAt, user.UpdatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	return user, nil
}

func (r *Repository) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	var user models.User
	err := r.db.QueryRow(ctx, `
		SELECT id, email, password_hash, name, created_at, updated_at
		FROM users WHERE email = $1
	`, email).Scan(&user.ID, &user.Email, &user.PasswordHash, &user.Name, &user.CreatedAt, &user.UpdatedAt)

	if err != nil {
		return nil, err
	}

	return &user, nil
}

func (r *Repository) GetUserByID(ctx context.Context, id string) (*models.User, error) {
	var user models.User
	err := r.db.QueryRow(ctx, `
		SELECT id, email, password_hash, name, created_at, updated_at
		FROM users WHERE id = $1
	`, id).Scan(&user.ID, &user.Email, &user.PasswordHash, &user.Name, &user.CreatedAt, &user.UpdatedAt)

	if err != nil {
		return nil, err
	}

	return &user, nil
}

// Site operations

func (r *Repository) CreateSite(ctx context.Context, userID, name, domain, timezone, currency string) (*models.Site, error) {
	site := &models.Site{
		ID:        uuid.New().String(),
		UserID:    userID,
		Name:      name,
		Domain:    domain,
		Timezone:  timezone,
		Currency:  currency,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
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
		SELECT id, user_id, name, domain, timezone, currency, created_at, updated_at
		FROM sites WHERE id = $1
	`, id).Scan(&site.ID, &site.UserID, &site.Name, &site.Domain, &site.Timezone, &site.Currency, &site.CreatedAt, &site.UpdatedAt)

	if err != nil {
		return nil, err
	}

	return &site, nil
}

func (r *Repository) GetSitesByUserID(ctx context.Context, userID string) ([]models.Site, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, user_id, name, domain, timezone, currency, created_at, updated_at
		FROM sites WHERE user_id = $1
		ORDER BY created_at DESC
	`, userID)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sites []models.Site
	for rows.Next() {
		var site models.Site
		if err := rows.Scan(&site.ID, &site.UserID, &site.Name, &site.Domain, &site.Timezone, &site.Currency, &site.CreatedAt, &site.UpdatedAt); err != nil {
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

func (r *Repository) ValidateAPIKey(ctx context.Context, apiKey string) (*models.Site, error) {
	// Hash the provided key
	hash := sha256.Sum256([]byte(apiKey))
	keyHash := hex.EncodeToString(hash[:])

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

func (r *Repository) RevokeAPIKey(ctx context.Context, keyID string) error {
	_, err := r.db.Exec(ctx, `UPDATE api_keys SET status = 'revoked' WHERE id = $1`, keyID)
	return err
}

// Check user has access to site
func (r *Repository) UserHasAccessToSite(ctx context.Context, userID, siteID string) (bool, error) {
	var count int
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM sites WHERE id = $1 AND user_id = $2
	`, siteID, userID).Scan(&count)

	if err != nil {
		return false, err
	}

	return count > 0, nil
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