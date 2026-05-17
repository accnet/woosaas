package sites

import (
	"context"
	"time"

	"github.com/accnet/woosaas/api/pkg/models"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// siteIntegrationRepo embeds pgxpool for ShopBase-specific DB operations.
// Methods are defined on Repository (same struct) in a separate file for clarity.

func (r *Repository) CreateShopBaseSite(
	ctx context.Context,
	userID string,
	meta models.ShopMetadata,
	apiKeyEncrypted, apiPasswordEncrypted, webhookSecretEncrypted string,
	syncOpts models.SyncOptions,
) (*models.Site, error) {
	siteID := uuid.New().String()
	now := time.Now()

	domain := meta.PrimaryDomain
	if domain == "" {
		domain = meta.Domain
	}
	if domain == "" {
		domain = meta.PlatformDomain
	}

	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		INSERT INTO sites (id, user_id, name, domain, timezone, currency, platform, external_shop_id, platform_domain, primary_domain, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, 'shopbase', $7, $8, $9, $10, $11)
	`, siteID, userID, meta.Name, domain, meta.Timezone, meta.Currency,
		meta.ExternalShopID, meta.PlatformDomain, meta.PrimaryDomain,
		now, now)
	if err != nil {
		return nil, err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO tracking_verifications (site_id, status, last_checked_at, created_at, updated_at)
		VALUES ($1, 'verified', $2, $2, $2)
	`, siteID, now)
	if err != nil {
		return nil, err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO site_members (site_id, user_id, role)
		VALUES ($1, $2, 'owner')
		ON CONFLICT (site_id, user_id) DO NOTHING
	`, siteID, userID)
	if err != nil {
		return nil, err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO site_integrations (
			site_id, platform, auth_type, shop_domain,
			api_key_encrypted, api_password_encrypted, webhook_secret_encrypted,
			status, last_verified_at, created_at, updated_at
		)
		VALUES ($1, 'shopbase', 'private_app', $2, $3, $4, $5, 'connected', $6, $6, $6)
	`, siteID, meta.PlatformDomain, apiKeyEncrypted, apiPasswordEncrypted, webhookSecretEncrypted, now)
	if err != nil {
		return nil, err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO shopbase_sync_state (site_id, order_sync_enabled, customer_sync_enabled, product_sync_enabled)
		VALUES ($1, $2, $3, $4)
	`, siteID, syncOpts.Orders, syncOpts.Customers, syncOpts.Products)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return r.GetSiteByID(ctx, siteID)
}

// GetSiteIntegration returns a site integration record (without encrypted fields).
func (r *Repository) GetSiteIntegration(ctx context.Context, siteID, platform string) (*models.SiteIntegration, error) {
	var si models.SiteIntegration
	err := r.db.QueryRow(ctx, `
		SELECT id, site_id, platform, auth_type, shop_domain, status, last_verified_at, COALESCE(last_error, ''), created_at, updated_at
		FROM site_integrations
		WHERE site_id = $1 AND platform = $2
	`, siteID, platform).Scan(
		&si.ID, &si.SiteID, &si.Platform, &si.AuthType, &si.ShopDomain,
		&si.Status, &si.LastVerifiedAt, &si.LastError, &si.CreatedAt, &si.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &si, nil
}

// GetSiteIntegrationCredentials returns decrypted-ready encrypted credential fields.
// Caller is responsible for decryption.
func (r *Repository) GetSiteIntegrationCredentials(ctx context.Context, siteID, platform string) (apiKeyEnc, apiPassEnc, webhookSecretEnc string, err error) {
	err = r.db.QueryRow(ctx, `
		SELECT COALESCE(api_key_encrypted,''), COALESCE(api_password_encrypted,''), COALESCE(webhook_secret_encrypted,'')
		FROM site_integrations
		WHERE site_id = $1 AND platform = $2
	`, siteID, platform).Scan(&apiKeyEnc, &apiPassEnc, &webhookSecretEnc)
	return
}

func (r *Repository) GetTrackingAPIKey(ctx context.Context, siteID string) (string, error) {
	var encrypted string
	err := r.db.QueryRow(ctx, `
		SELECT COALESCE(tracking_api_key_encrypted, '')
		FROM site_integrations
		WHERE site_id = $1 AND platform = 'shopbase'
	`, siteID).Scan(&encrypted)
	return encrypted, err
}

func (r *Repository) SetShopBaseTrackingAPIKey(ctx context.Context, siteID, encryptedKey string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE site_integrations
		SET tracking_api_key_encrypted = $2, updated_at = NOW()
		WHERE site_id = $1 AND platform = 'shopbase'
	`, siteID, encryptedKey)
	return err
}

// GetShopBaseSyncState returns the sync state for a ShopBase site.
func (r *Repository) GetShopBaseSyncState(ctx context.Context, siteID string) (*models.ShopBaseSyncState, error) {
	var s models.ShopBaseSyncState
	err := r.db.QueryRow(ctx, `
		SELECT site_id, order_sync_enabled, checkout_sync_enabled, customer_sync_enabled, product_sync_enabled,
			status, last_order_updated_at, last_customer_updated_at, last_product_updated_at,
			last_webhook_at, last_success_at, COALESCE(last_error, ''), last_error_at, backfill_completed_at, created_at, updated_at
		FROM shopbase_sync_state WHERE site_id = $1
	`, siteID).Scan(
		&s.SiteID, &s.OrderSyncEnabled, &s.CheckoutSyncEnabled, &s.CustomerSyncEnabled, &s.ProductSyncEnabled,
		&s.Status, &s.LastOrderUpdatedAt, &s.LastCustomerUpdatedAt, &s.LastProductUpdatedAt,
		&s.LastWebhookAt, &s.LastSuccessAt, &s.LastError, &s.LastErrorAt, &s.BackfillCompletedAt, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

// MarkShopBaseSyncStatus updates the sync status field.
func (r *Repository) MarkShopBaseSyncStatus(ctx context.Context, siteID, status string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE shopbase_sync_state SET status = $2, updated_at = NOW() WHERE site_id = $1
	`, siteID, status)
	return err
}

// MarkShopBaseSyncError records a sync error.
func (r *Repository) MarkShopBaseSyncError(ctx context.Context, siteID string, syncErr error) error {
	_, err := r.db.Exec(ctx, `
		UPDATE shopbase_sync_state
		SET status = 'error', last_error = $2, last_error_at = NOW(), updated_at = NOW()
		WHERE site_id = $1
	`, siteID, syncErr.Error())
	return err
}

// MarkShopBaseWebhookReceived updates last_webhook_at.
func (r *Repository) MarkShopBaseWebhookReceived(ctx context.Context, siteID string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE shopbase_sync_state SET last_webhook_at = NOW(), updated_at = NOW() WHERE site_id = $1
	`, siteID)
	return err
}

// MarkShopBaseBackfillComplete marks the backfill as completed.
func (r *Repository) MarkShopBaseBackfillComplete(ctx context.Context, siteID string, lastOrderAt *time.Time) error {
	_, err := r.db.Exec(ctx, `
		UPDATE shopbase_sync_state
		SET status = 'idle', backfill_completed_at = NOW(), last_success_at = NOW(),
			last_order_updated_at = COALESCE($2, last_order_updated_at), updated_at = NOW()
		WHERE site_id = $1
	`, siteID, lastOrderAt)
	return err
}

// MarkShopBaseIntegrationDisconnected marks the integration as disconnected.
func (r *Repository) MarkShopBaseIntegrationDisconnected(ctx context.Context, siteID string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE site_integrations SET status = 'disconnected', updated_at = NOW()
		WHERE site_id = $1 AND platform = 'shopbase'
	`, siteID)
	if err != nil {
		return err
	}
	_, err = r.db.Exec(ctx, `
		UPDATE shopbase_sync_state
		SET order_sync_enabled = FALSE, customer_sync_enabled = FALSE, product_sync_enabled = FALSE, updated_at = NOW()
		WHERE site_id = $1
	`, siteID)
	return err
}

// UpdateShopBaseLastOrderSyncedAt updates the last order cursor.
func (r *Repository) UpdateShopBaseLastOrderSyncedAt(ctx context.Context, siteID string, t time.Time) error {
	_, err := r.db.Exec(ctx, `
		UPDATE shopbase_sync_state SET last_order_updated_at = $2, updated_at = NOW() WHERE site_id = $1
	`, siteID, t)
	return err
}

// GetShopBaseSitesByStatus returns all sites with ShopBase integration matching a status.
func (r *Repository) GetShopBaseSiteIDs(ctx context.Context, status string) ([]string, error) {
	rows, err := r.db.Query(ctx, `
		SELECT site_id FROM site_integrations WHERE platform = 'shopbase' AND status = $1
	`, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, nil
}

// helper used by worker
func NewRepositoryFromPool(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}
