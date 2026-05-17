package shipment_tracking

import (
	"context"
	"strings"

	"github.com/accnet/woosaas/api/internal/order_status"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

func (r *Repository) ListByOrder(ctx context.Context, siteID, sourcePlatform, wooOrderID string) ([]ShipmentTracking, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id::text, site_id::text, source_platform, woo_order_id, tracking_number,
			carrier_slug, carrier_name, provider, provider_tracking_id, status, status_raw,
			tracking_url, last_checkpoint_at, last_synced_at, sync_error, wc_push_status,
			wc_push_error, wc_pushed_at, created_at, updated_at
		FROM shipment_trackings
		WHERE site_id = $1 AND source_platform = $2 AND woo_order_id = $3
		ORDER BY created_at DESC
	`, siteID, sourcePlatform, wooOrderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	trackings := make([]ShipmentTracking, 0)
	for rows.Next() {
		t, err := scanTracking(rows)
		if err != nil {
			return nil, err
		}
		trackings = append(trackings, t)
	}
	return trackings, rows.Err()
}

func (r *Repository) Create(ctx context.Context, input CreateTrackingInput) (*ShipmentTracking, error) {
	var t ShipmentTracking
	err := r.db.QueryRow(ctx, `
		INSERT INTO shipment_trackings (
			site_id, source_platform, woo_order_id, tracking_number, carrier_slug,
			carrier_name, provider, status, tracking_url
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id::text, site_id::text, source_platform, woo_order_id, tracking_number,
			carrier_slug, carrier_name, provider, provider_tracking_id, status, status_raw,
			tracking_url, last_checkpoint_at, last_synced_at, sync_error, wc_push_status,
			wc_push_error, wc_pushed_at, created_at, updated_at
	`, input.SiteID, input.SourcePlatform, input.WooOrderID, input.TrackingNumber, input.CarrierSlug,
		input.CarrierName, input.Provider, input.Status, input.TrackingURL).Scan(scanTrackingDest(&t)...)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *Repository) Get(ctx context.Context, siteID, trackingID string) (*ShipmentTracking, error) {
	var t ShipmentTracking
	err := r.db.QueryRow(ctx, `
		SELECT id::text, site_id::text, source_platform, woo_order_id, tracking_number,
			carrier_slug, carrier_name, provider, provider_tracking_id, status, status_raw,
			tracking_url, last_checkpoint_at, last_synced_at, sync_error, wc_push_status,
			wc_push_error, wc_pushed_at, created_at, updated_at
		FROM shipment_trackings
		WHERE site_id = $1 AND id = $2
	`, siteID, trackingID).Scan(scanTrackingDest(&t)...)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (r *Repository) Delete(ctx context.Context, siteID, trackingID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM shipment_trackings WHERE site_id = $1 AND id = $2`, siteID, trackingID)
	return err
}

func (r *Repository) ApplyTrackingStatusToOrder(ctx context.Context, siteID, sourcePlatform, wooOrderID, trackingStatus string) error {
	lifecycleStatus := order_status.FromTrackingStatus(trackingStatus)
	_, err := r.db.Exec(ctx, `
		UPDATE commerce_orders
		SET fulfillment_status = CASE
				WHEN $4 IN ('fulfilled', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'failed_delivery', 'returned')
					THEN 'fulfilled'
				ELSE fulfillment_status
			END,
			status = $4,
			updated_at = NOW()
		WHERE site_id = $1 AND source_platform = $2 AND woo_order_id = $3
	`, siteID, sourcePlatform, wooOrderID, lifecycleStatus)
	return err
}

func (r *Repository) MarkWCPushOK(ctx context.Context, trackingID string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE shipment_trackings
		SET wc_push_status = $2, wc_push_error = NULL, wc_pushed_at = NOW(), updated_at = NOW()
		WHERE id = $1
	`, trackingID, WCPushStatusOK)
	return err
}

func (r *Repository) MarkWCPushError(ctx context.Context, trackingID string, pushErr error) error {
	msg := ""
	if pushErr != nil {
		msg = pushErr.Error()
	}
	_, err := r.db.Exec(ctx, `
		UPDATE shipment_trackings
		SET wc_push_status = $2, wc_push_error = $3, updated_at = NOW()
		WHERE id = $1
	`, trackingID, WCPushStatusError, msg)
	return err
}

func (r *Repository) SaveWCPushConfig(ctx context.Context, siteID, pushURL, encryptedToken string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE sites
		SET wc_push_url = $2, wc_push_token_encrypted = $3, updated_at = NOW()
		WHERE id = $1
	`, siteID, strings.TrimRight(pushURL, "/"), encryptedToken)
	return err
}

type scanner interface {
	Scan(dest ...interface{}) error
}

func scanTracking(row scanner) (ShipmentTracking, error) {
	var t ShipmentTracking
	err := row.Scan(scanTrackingDest(&t)...)
	return t, err
}

func scanTrackingDest(t *ShipmentTracking) []interface{} {
	return []interface{}{
		&t.ID,
		&t.SiteID,
		&t.SourcePlatform,
		&t.WooOrderID,
		&t.TrackingNumber,
		&t.CarrierSlug,
		&t.CarrierName,
		&t.Provider,
		&t.ProviderTrackingID,
		&t.Status,
		&t.StatusRaw,
		&t.TrackingURL,
		&t.LastCheckpointAt,
		&t.LastSyncedAt,
		&t.SyncError,
		&t.WCPushStatus,
		&t.WCPushError,
		&t.WCPushedAt,
		&t.CreatedAt,
		&t.UpdatedAt,
	}
}
