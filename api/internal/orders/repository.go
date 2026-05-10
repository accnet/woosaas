package orders

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/accnet/woosaas/api/pkg/models"
)

type Repository struct {
	db *pgxpool.Pool
}

type ListOrdersParams struct {
	SiteID            string
	Page              int
	PageSize          int
	Query             string
	PaymentStatus     string
	FulfillmentStatus string
	Status            string
	DateFrom          *time.Time
	DateTo            *time.Time
}

type ListContactsParams struct {
	SiteID   string
	Page     int
	PageSize int
	Query    string
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

func (r *Repository) UpsertOrderSnapshot(ctx context.Context, siteID string, input models.WooOrderInput, contactSyncEnabled bool) error {
	tx, err := r.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	modifiedAt, err := parseOptionalTimeValue(input.ModifiedAtWoo)
	if err != nil || modifiedAt == nil {
		return fmt.Errorf("invalid modified_at_woo")
	}

	var existingModified *time.Time
	var existingContactID *string
	err = tx.QueryRow(ctx, `
		SELECT modified_at_woo, contact_id
		FROM woo_orders
		WHERE site_id = $1 AND woo_order_id = $2
	`, siteID, input.WooOrderID).Scan(&existingModified, &existingContactID)
	if err != nil && err != pgx.ErrNoRows {
		return err
	}
	if existingModified != nil && !modifiedAt.After(*existingModified) {
		return r.markSyncSuccess(ctx, tx, siteID, contactSyncEnabled)
	}

	createdAt, err := parseOptionalTimePtr(input.CreatedAtWoo)
	if err != nil {
		return fmt.Errorf("invalid created_at_woo")
	}
	paidAt, err := parseOptionalTimePtr(input.PaidAtWoo)
	if err != nil {
		return fmt.Errorf("invalid paid_at_woo")
	}
	completedAt, err := parseOptionalTimePtr(input.CompletedAtWoo)
	if err != nil {
		return fmt.Errorf("invalid completed_at_woo")
	}
	deletedAt, err := parseOptionalTimePtr(input.DeletedAtWoo)
	if err != nil {
		return fmt.Errorf("invalid deleted_at_woo")
	}

	billingJSON := marshalJSONMap(input.BillingAddress)
	shippingJSON := marshalJSONMap(input.ShippingAddress)
	attributionJSON := marshalJSONMap(input.Attribution)
	rawOrderJSON := marshalJSONMap(input.RawOrder)

	var contactID *string
	if contactSyncEnabled {
		contactID, err = r.upsertDerivedContact(ctx, tx, siteID, input, createdAt)
		if err != nil {
			return err
		}
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO woo_orders (
			site_id, woo_order_id, woo_customer_id, status, payment_status, fulfillment_status, currency,
			total_amount, subtotal_amount, discount_amount, shipping_amount, tax_amount, refund_amount, items_count,
			customer_email, customer_first_name, customer_last_name, customer_phone, billing_company,
			billing_address_json, shipping_address_json, client_id, session_id, attribution_json, contact_id,
			created_at_woo, paid_at_woo, completed_at_woo, modified_at_woo, deleted_at_woo, raw_order_json, synced_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7,
			$8, $9, $10, $11, $12, $13, $14,
			$15, $16, $17, $18, $19,
			$20, $21, $22, $23, $24, $25,
			$26, $27, $28, $29, $30, $31, NOW(), NOW()
		)
		ON CONFLICT (site_id, woo_order_id) DO UPDATE SET
			woo_customer_id = EXCLUDED.woo_customer_id,
			status = EXCLUDED.status,
			payment_status = EXCLUDED.payment_status,
			fulfillment_status = EXCLUDED.fulfillment_status,
			currency = EXCLUDED.currency,
			total_amount = EXCLUDED.total_amount,
			subtotal_amount = EXCLUDED.subtotal_amount,
			discount_amount = EXCLUDED.discount_amount,
			shipping_amount = EXCLUDED.shipping_amount,
			tax_amount = EXCLUDED.tax_amount,
			refund_amount = EXCLUDED.refund_amount,
			items_count = EXCLUDED.items_count,
			customer_email = EXCLUDED.customer_email,
			customer_first_name = EXCLUDED.customer_first_name,
			customer_last_name = EXCLUDED.customer_last_name,
			customer_phone = EXCLUDED.customer_phone,
			billing_company = EXCLUDED.billing_company,
			billing_address_json = EXCLUDED.billing_address_json,
			shipping_address_json = EXCLUDED.shipping_address_json,
			client_id = EXCLUDED.client_id,
			session_id = EXCLUDED.session_id,
			attribution_json = EXCLUDED.attribution_json,
			contact_id = EXCLUDED.contact_id,
			created_at_woo = EXCLUDED.created_at_woo,
			paid_at_woo = EXCLUDED.paid_at_woo,
			completed_at_woo = EXCLUDED.completed_at_woo,
			modified_at_woo = EXCLUDED.modified_at_woo,
			deleted_at_woo = EXCLUDED.deleted_at_woo,
			raw_order_json = EXCLUDED.raw_order_json,
			synced_at = NOW(),
			updated_at = NOW()
	`, siteID, input.WooOrderID, nullIfEmpty(input.WooCustomerID), input.Status, nullIfEmpty(input.PaymentStatus), nullIfEmpty(input.FulfillmentStatus), input.Currency,
		input.TotalAmount, input.SubtotalAmount, input.DiscountAmount, input.ShippingAmount, input.TaxAmount, input.RefundAmount, normalizedItemsCount(input),
		nullIfEmpty(normalizeEmail(input.CustomerEmail)), nullIfEmpty(strings.TrimSpace(input.CustomerFirstName)), nullIfEmpty(strings.TrimSpace(input.CustomerLastName)), nullIfEmpty(normalizePhone(input.CustomerPhone)), nullIfEmpty(strings.TrimSpace(input.BillingCompany)),
		billingJSON, shippingJSON, nullIfEmpty(strings.TrimSpace(input.ClientID)), nullIfEmpty(strings.TrimSpace(input.SessionID)), attributionJSON, contactID,
		createdAt, paidAt, completedAt, modifiedAt, deletedAt, rawOrderJSON); err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, `DELETE FROM woo_order_items WHERE site_id = $1 AND woo_order_id = $2`, siteID, input.WooOrderID); err != nil {
		return err
	}
	for _, item := range input.Items {
		rawItemJSON := marshalJSON(item)
		if _, err := tx.Exec(ctx, `
			INSERT INTO woo_order_items (
				site_id, woo_order_id, line_item_id, product_id, variation_id, sku, name, quantity,
				unit_price, line_subtotal, line_total, line_tax, raw_item_json, updated_at
			) VALUES (
				$1, $2, $3, $4, $5, $6, $7, $8,
				$9, $10, $11, $12, $13, NOW()
			)
		`, siteID, input.WooOrderID, item.LineItemID, nullIfEmpty(item.ProductID), nullIfEmpty(item.VariationID), nullIfEmpty(item.SKU), nullIfEmpty(item.Name), item.Quantity,
			item.UnitPrice, item.LineSubtotal, item.LineTotal, item.LineTax, rawItemJSON); err != nil {
			return err
		}
	}

	if contactSyncEnabled && contactID != nil {
		if err := r.recomputeContactAggregates(ctx, tx, siteID, *contactID); err != nil {
			return err
		}
	}

	if err := r.markSyncSuccess(ctx, tx, siteID, contactSyncEnabled); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (r *Repository) MarkSyncError(ctx context.Context, siteID string, contactSyncEnabled bool, syncErr error) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO woo_order_sync_state (
			site_id, contact_sync_enabled, status, last_error, last_error_at, updated_at
		) VALUES ($1, $2, 'error', $3, NOW(), NOW())
		ON CONFLICT (site_id) DO UPDATE SET
			contact_sync_enabled = EXCLUDED.contact_sync_enabled,
			status = 'error',
			last_error = EXCLUDED.last_error,
			last_error_at = NOW(),
			updated_at = NOW()
	`, siteID, contactSyncEnabled, syncErr.Error())
	return err
}

func (r *Repository) ListOrders(ctx context.Context, params ListOrdersParams) (*models.WooOrderListResponse, error) {
	page := maxInt(params.Page, 1)
	pageSize := maxInt(params.PageSize, 1)
	if pageSize > 100 {
		pageSize = 100
	}

	where, args := buildOrderListWhere(params)
	countSQL := `SELECT COUNT(*) FROM woo_orders WHERE ` + where
	var total int
	if err := r.db.QueryRow(ctx, countSQL, args...).Scan(&total); err != nil {
		return nil, err
	}

	args = append(args, pageSize, (page-1)*pageSize)
	sql := `
		SELECT woo_order_id, created_at_woo,
			COALESCE(NULLIF(TRIM(CONCAT(COALESCE(customer_first_name, ''), ' ', COALESCE(customer_last_name, ''))), ''), customer_email, 'Unknown') AS customer_name,
			COALESCE(customer_email, ''), COALESCE(payment_status, ''), COALESCE(fulfillment_status, ''),
			COALESCE(total_amount::float8, 0), COALESCE(currency, ''), COALESCE(items_count, 0), COALESCE(status, ''), contact_id::text
		FROM woo_orders
		WHERE ` + where + `
		ORDER BY created_at_woo DESC NULLS LAST, woo_order_id DESC
		LIMIT $` + fmt.Sprint(len(args)-1) + ` OFFSET $` + fmt.Sprint(len(args))

	rows, err := r.db.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	orders := make([]models.WooOrderListItem, 0, pageSize)
	for rows.Next() {
		var item models.WooOrderListItem
		if err := rows.Scan(
			&item.WooOrderID,
			&item.CreatedAtWoo,
			&item.CustomerName,
			&item.CustomerEmail,
			&item.PaymentStatus,
			&item.FulfillmentStatus,
			&item.TotalAmount,
			&item.Currency,
			&item.ItemsCount,
			&item.Status,
			&item.ContactID,
		); err != nil {
			return nil, err
		}
		orders = append(orders, item)
	}

	return &models.WooOrderListResponse{
		Orders:     orders,
		TotalCount: total,
		Page:       page,
		PageSize:   pageSize,
	}, nil
}

func (r *Repository) GetOrderDetail(ctx context.Context, siteID, wooOrderID string) (*models.WooOrderDetail, error) {
	var detail models.WooOrderDetail
	var billingJSON, shippingJSON, attributionJSON, rawOrderJSON []byte
	err := r.db.QueryRow(ctx, `
		SELECT id, site_id, woo_order_id, COALESCE(woo_customer_id, ''), status, COALESCE(payment_status, ''),
			COALESCE(fulfillment_status, ''), currency, total_amount::float8, subtotal_amount::float8,
			discount_amount::float8, shipping_amount::float8, tax_amount::float8, refund_amount::float8,
			items_count, COALESCE(customer_email, ''), COALESCE(customer_first_name, ''), COALESCE(customer_last_name, ''),
			COALESCE(customer_phone, ''), COALESCE(billing_company, ''), billing_address_json, shipping_address_json,
			COALESCE(client_id, ''), COALESCE(session_id, ''), attribution_json, contact_id::text,
			created_at_woo, paid_at_woo, completed_at_woo, modified_at_woo, deleted_at_woo, synced_at, created_at, updated_at,
			raw_order_json
		FROM woo_orders
		WHERE site_id = $1 AND woo_order_id = $2
	`, siteID, wooOrderID).Scan(
		&detail.ID, &detail.SiteID, &detail.WooOrderID, &detail.WooCustomerID, &detail.Status, &detail.PaymentStatus,
		&detail.FulfillmentStatus, &detail.Currency, &detail.TotalAmount, &detail.SubtotalAmount,
		&detail.DiscountAmount, &detail.ShippingAmount, &detail.TaxAmount, &detail.RefundAmount,
		&detail.ItemsCount, &detail.CustomerEmail, &detail.CustomerFirstName, &detail.CustomerLastName,
		&detail.CustomerPhone, &detail.BillingCompany, &billingJSON, &shippingJSON,
		&detail.ClientID, &detail.SessionID, &attributionJSON, &detail.ContactID,
		&detail.CreatedAtWoo, &detail.PaidAtWoo, &detail.CompletedAtWoo, &detail.ModifiedAtWoo, &detail.DeletedAtWoo, &detail.SyncedAt, &detail.CreatedAt, &detail.UpdatedAt,
		&rawOrderJSON,
	)
	if err != nil {
		return nil, err
	}
	detail.BillingAddress = unmarshalMap(billingJSON)
	detail.ShippingAddress = unmarshalMap(shippingJSON)
	detail.Attribution = unmarshalMap(attributionJSON)
	detail.RawOrder = unmarshalMap(rawOrderJSON)

	itemsRows, err := r.db.Query(ctx, `
		SELECT line_item_id, COALESCE(product_id, ''), COALESCE(variation_id, ''), COALESCE(sku, ''), COALESCE(name, ''),
			quantity, unit_price::float8, line_subtotal::float8, line_total::float8, line_tax::float8
		FROM woo_order_items
		WHERE site_id = $1 AND woo_order_id = $2
		ORDER BY created_at ASC, line_item_id ASC
	`, siteID, wooOrderID)
	if err != nil {
		return nil, err
	}
	defer itemsRows.Close()
	detail.Items = make([]models.WooOrderItem, 0)
	for itemsRows.Next() {
		var item models.WooOrderItem
		if err := itemsRows.Scan(&item.LineItemID, &item.ProductID, &item.VariationID, &item.SKU, &item.Name, &item.Quantity, &item.UnitPrice, &item.LineSubtotal, &item.LineTotal, &item.LineTax); err != nil {
			return nil, err
		}
		detail.Items = append(detail.Items, item)
	}

	if detail.ContactID != nil {
		contact, err := r.getContactByID(ctx, siteID, *detail.ContactID)
		if err != nil && err != pgx.ErrNoRows {
			return nil, err
		}
		if err == nil {
			detail.Contact = contact
		}
	}

	return &detail, nil
}

func (r *Repository) ListContacts(ctx context.Context, params ListContactsParams) (*models.WooContactListResponse, error) {
	page := maxInt(params.Page, 1)
	pageSize := maxInt(params.PageSize, 1)
	if pageSize > 100 {
		pageSize = 100
	}
	where := "site_id = $1"
	args := []interface{}{params.SiteID}
	if q := strings.TrimSpace(params.Query); q != "" {
		where += ` AND (
			COALESCE(email, '') ILIKE $2 OR
			COALESCE(phone, '') ILIKE $2 OR
			COALESCE(full_name, '') ILIKE $2
		)`
		args = append(args, "%"+q+"%")
	}

	var total int
	if err := r.db.QueryRow(ctx, `SELECT COUNT(*) FROM woo_order_contacts WHERE `+where, args...).Scan(&total); err != nil {
		return nil, err
	}

	args = append(args, pageSize, (page-1)*pageSize)
	sql := `
		SELECT id::text, COALESCE(email, ''), COALESCE(phone, ''), COALESCE(full_name, ''), COALESCE(company, ''),
			orders_count, total_spent::float8, first_seen_at, last_seen_at, COALESCE(first_name, ''), COALESCE(last_name, ''),
			COALESCE(woo_customer_id, ''), billing_address_json, shipping_address_json
		FROM woo_order_contacts
		WHERE ` + where + `
		ORDER BY last_seen_at DESC NULLS LAST, created_at DESC
		LIMIT $` + fmt.Sprint(len(args)-1) + ` OFFSET $` + fmt.Sprint(len(args))

	rows, err := r.db.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	contacts := make([]models.WooOrderContact, 0, pageSize)
	for rows.Next() {
		var contact models.WooOrderContact
		var billingJSON, shippingJSON []byte
		if err := rows.Scan(&contact.ID, &contact.Email, &contact.Phone, &contact.FullName, &contact.Company,
			&contact.OrdersCount, &contact.TotalSpent, &contact.FirstSeenAt, &contact.LastSeenAt, &contact.FirstName, &contact.LastName,
			&contact.WooCustomerID, &billingJSON, &shippingJSON); err != nil {
			return nil, err
		}
		contact.BillingAddress = unmarshalMap(billingJSON)
		contact.ShippingAddress = unmarshalMap(shippingJSON)
		contacts = append(contacts, contact)
	}

	return &models.WooContactListResponse{
		Contacts:   contacts,
		TotalCount: total,
		Page:       page,
		PageSize:   pageSize,
	}, nil
}

func (r *Repository) GetSyncState(ctx context.Context, siteID string) (*models.WooOrderSyncState, error) {
	var state models.WooOrderSyncState
	err := r.db.QueryRow(ctx, `
		SELECT site_id::text, order_sync_enabled, contact_sync_enabled, status,
			last_backfill_modified_at, last_backfill_order_id, last_realtime_synced_at, last_success_at,
			last_error, last_error_at, backfill_completed_at, created_at, updated_at
		FROM woo_order_sync_state
		WHERE site_id = $1
	`, siteID).Scan(
		&state.SiteID,
		&state.OrderSyncEnabled,
		&state.ContactSyncEnabled,
		&state.Status,
		&state.LastBackfillModifiedAt,
		&state.LastBackfillOrderID,
		&state.LastRealtimeSyncedAt,
		&state.LastSuccessAt,
		&state.LastError,
		&state.LastErrorAt,
		&state.BackfillCompletedAt,
		&state.CreatedAt,
		&state.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &state, nil
}

func (r *Repository) getContactByID(ctx context.Context, siteID, id string) (*models.WooOrderContact, error) {
	var contact models.WooOrderContact
	var billingJSON, shippingJSON []byte
	err := r.db.QueryRow(ctx, `
		SELECT id::text, COALESCE(email, ''), COALESCE(phone, ''), COALESCE(full_name, ''), COALESCE(company, ''),
			orders_count, total_spent::float8, first_seen_at, last_seen_at, COALESCE(first_name, ''), COALESCE(last_name, ''),
			COALESCE(woo_customer_id, ''), billing_address_json, shipping_address_json
		FROM woo_order_contacts
		WHERE site_id = $1 AND id = $2
	`, siteID, id).Scan(&contact.ID, &contact.Email, &contact.Phone, &contact.FullName, &contact.Company,
		&contact.OrdersCount, &contact.TotalSpent, &contact.FirstSeenAt, &contact.LastSeenAt, &contact.FirstName, &contact.LastName,
		&contact.WooCustomerID, &billingJSON, &shippingJSON)
	if err != nil {
		return nil, err
	}
	contact.BillingAddress = unmarshalMap(billingJSON)
	contact.ShippingAddress = unmarshalMap(shippingJSON)
	return &contact, nil
}

func (r *Repository) upsertDerivedContact(ctx context.Context, tx pgx.Tx, siteID string, input models.WooOrderInput, createdAt *time.Time) (*string, error) {
	email := normalizeEmail(input.CustomerEmail)
	phone := normalizePhone(input.CustomerPhone)

	var existingID string
	var existingEmail, existingPhone, existingFirstName, existingLastName, existingFullName, existingCompany, existingCustomerID string
	var existingBillingJSON, existingShippingJSON []byte
	err := tx.QueryRow(ctx, `
		SELECT id::text, COALESCE(email, ''), COALESCE(phone, ''), COALESCE(first_name, ''), COALESCE(last_name, ''),
			COALESCE(full_name, ''), COALESCE(company, ''), COALESCE(woo_customer_id, ''), billing_address_json, shipping_address_json
		FROM woo_order_contacts
		WHERE site_id = $1 AND (
			($2 <> '' AND email = $2) OR
			($2 = '' AND $3 <> '' AND phone = $3)
		)
		LIMIT 1
	`, siteID, email, phone).Scan(&existingID, &existingEmail, &existingPhone, &existingFirstName, &existingLastName, &existingFullName, &existingCompany, &existingCustomerID, &existingBillingJSON, &existingShippingJSON)
	if err != nil && err != pgx.ErrNoRows {
		return nil, err
	}

	firstName := strings.TrimSpace(input.CustomerFirstName)
	lastName := strings.TrimSpace(input.CustomerLastName)
	fullName := strings.TrimSpace(strings.TrimSpace(firstName + " " + lastName))
	if fullName == "" {
		fullName = email
	}
	billingJSON := marshalJSONMap(input.BillingAddress)
	shippingJSON := marshalJSONMap(input.ShippingAddress)
	nowSeenAt := createdAt
	if nowSeenAt == nil {
		now := time.Now().UTC()
		nowSeenAt = &now
	}

	if err == pgx.ErrNoRows {
		id := uuid.New().String()
		if _, err := tx.Exec(ctx, `
			INSERT INTO woo_order_contacts (
				id, site_id, woo_customer_id, email, phone, first_name, last_name, full_name, company,
				billing_address_json, shipping_address_json, first_order_id, last_order_id, first_seen_at, last_seen_at,
				created_at, updated_at
			) VALUES (
				$1, $2, $3, $4, $5, $6, $7, $8, $9,
				$10, $11, $12, $12, $13, $13, NOW(), NOW()
			)
		`, id, siteID, nullIfEmpty(input.WooCustomerID), nullIfEmpty(email), nullIfEmpty(phone), nullIfEmpty(firstName), nullIfEmpty(lastName), nullIfEmpty(fullName),
			nullIfEmpty(strings.TrimSpace(input.BillingCompany)), billingJSON, shippingJSON, input.WooOrderID, nowSeenAt); err != nil {
			return nil, err
		}
		return &id, nil
	}

	mergedBilling := chooseJSON(existingBillingJSON, billingJSON)
	mergedShipping := chooseJSON(existingShippingJSON, shippingJSON)
	if _, err := tx.Exec(ctx, `
		UPDATE woo_order_contacts
		SET woo_customer_id = COALESCE(NULLIF(woo_customer_id, ''), $3),
			email = COALESCE(NULLIF(email, ''), $4),
			phone = COALESCE(NULLIF(phone, ''), $5),
			first_name = COALESCE(NULLIF(first_name, ''), $6),
			last_name = COALESCE(NULLIF(last_name, ''), $7),
			full_name = COALESCE(NULLIF(full_name, ''), $8),
			company = COALESCE(NULLIF(company, ''), $9),
			billing_address_json = $10,
			shipping_address_json = $11,
			last_order_id = $12,
			last_seen_at = GREATEST(COALESCE(last_seen_at, $13), $13),
			updated_at = NOW()
		WHERE site_id = $1 AND id = $2
	`, siteID, existingID, nullIfEmpty(input.WooCustomerID), nullIfEmpty(email), nullIfEmpty(phone), nullIfEmpty(firstName), nullIfEmpty(lastName), nullIfEmpty(fullName),
		nullIfEmpty(strings.TrimSpace(input.BillingCompany)), mergedBilling, mergedShipping, input.WooOrderID, nowSeenAt); err != nil {
		return nil, err
	}

	return &existingID, nil
}

func (r *Repository) recomputeContactAggregates(ctx context.Context, tx pgx.Tx, siteID, contactID string) error {
	_, err := tx.Exec(ctx, `
		WITH aggregates AS (
			SELECT
				COUNT(*)::int AS orders_count,
				COALESCE(SUM(total_amount), 0)::numeric(18,2) AS total_spent,
				MIN(created_at_woo) AS first_seen_at,
				MAX(created_at_woo) AS last_seen_at,
				(ARRAY_AGG(woo_order_id ORDER BY created_at_woo ASC NULLS LAST, woo_order_id ASC))[1] AS first_order_id,
				(ARRAY_AGG(woo_order_id ORDER BY created_at_woo DESC NULLS LAST, woo_order_id DESC))[1] AS last_order_id
			FROM woo_orders
			WHERE site_id = $1 AND contact_id = $2
		)
		UPDATE woo_order_contacts c
		SET orders_count = a.orders_count,
			total_spent = a.total_spent,
			first_seen_at = a.first_seen_at,
			last_seen_at = a.last_seen_at,
			first_order_id = a.first_order_id,
			last_order_id = a.last_order_id,
			updated_at = NOW()
		FROM aggregates a
		WHERE c.site_id = $1 AND c.id = $2
	`, siteID, contactID)
	return err
}

func (r *Repository) markSyncSuccess(ctx context.Context, tx pgx.Tx, siteID string, contactSyncEnabled bool) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO woo_order_sync_state (
			site_id, order_sync_enabled, contact_sync_enabled, status,
			last_realtime_synced_at, last_success_at, last_error, updated_at
		) VALUES ($1, TRUE, $2, 'ok', NOW(), NOW(), NULL, NOW())
		ON CONFLICT (site_id) DO UPDATE SET
			order_sync_enabled = TRUE,
			contact_sync_enabled = EXCLUDED.contact_sync_enabled,
			status = 'ok',
			last_realtime_synced_at = NOW(),
			last_success_at = NOW(),
			last_error = NULL,
			updated_at = NOW()
	`, siteID, contactSyncEnabled)
	return err
}

func buildOrderListWhere(params ListOrdersParams) (string, []interface{}) {
	where := []string{"site_id = $1"}
	args := []interface{}{params.SiteID}
	argIndex := 2
	if q := strings.TrimSpace(params.Query); q != "" {
		where = append(where, fmt.Sprintf(`(
			woo_order_id ILIKE $%d OR
			COALESCE(customer_email, '') ILIKE $%d OR
			TRIM(CONCAT(COALESCE(customer_first_name, ''), ' ', COALESCE(customer_last_name, ''))) ILIKE $%d
		)`, argIndex, argIndex, argIndex))
		args = append(args, "%"+q+"%")
		argIndex++
	}
	if params.PaymentStatus != "" {
		where = append(where, fmt.Sprintf("payment_status = $%d", argIndex))
		args = append(args, params.PaymentStatus)
		argIndex++
	}
	if params.FulfillmentStatus != "" {
		where = append(where, fmt.Sprintf("fulfillment_status = $%d", argIndex))
		args = append(args, params.FulfillmentStatus)
		argIndex++
	}
	if params.Status != "" {
		where = append(where, fmt.Sprintf("status = $%d", argIndex))
		args = append(args, params.Status)
		argIndex++
	}
	if params.DateFrom != nil {
		where = append(where, fmt.Sprintf("created_at_woo >= $%d", argIndex))
		args = append(args, *params.DateFrom)
		argIndex++
	}
	if params.DateTo != nil {
		where = append(where, fmt.Sprintf("created_at_woo <= $%d", argIndex))
		args = append(args, *params.DateTo)
	}
	return strings.Join(where, " AND "), args
}

func parseOptionalTimePtr(value *string) (*time.Time, error) {
	if value == nil || strings.TrimSpace(*value) == "" {
		return nil, nil
	}
	return parseOptionalTimeValue(*value)
}

func parseOptionalTimeValue(value string) (*time.Time, error) {
	layouts := []string{time.RFC3339Nano, time.RFC3339, "2006-01-02 15:04:05"}
	trimmed := strings.TrimSpace(value)
	for _, layout := range layouts {
		if parsed, err := time.Parse(layout, trimmed); err == nil {
			utc := parsed.UTC()
			return &utc, nil
		}
	}
	return nil, fmt.Errorf("invalid time")
}

func marshalJSONMap(value map[string]interface{}) []byte {
	if value == nil {
		return []byte(`{}`)
	}
	return marshalJSON(value)
}

func marshalJSON(value interface{}) []byte {
	data, err := json.Marshal(value)
	if err != nil {
		return []byte(`{}`)
	}
	return data
}

func unmarshalMap(value []byte) map[string]interface{} {
	if len(value) == 0 {
		return map[string]interface{}{}
	}
	var decoded map[string]interface{}
	if err := json.Unmarshal(value, &decoded); err != nil || decoded == nil {
		return map[string]interface{}{}
	}
	return decoded
}

func chooseJSON(existing []byte, incoming []byte) []byte {
	if len(strings.TrimSpace(string(existing))) > 2 {
		return existing
	}
	return incoming
}

func normalizeEmail(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func normalizePhone(value string) string {
	var b strings.Builder
	for i, r := range strings.TrimSpace(value) {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
			continue
		}
		if r == '+' && i == 0 {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func nullIfEmpty(value string) interface{} {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func maxInt(value, fallback int) int {
	if value > 0 {
		return value
	}
	return fallback
}

func normalizedItemsCount(input models.WooOrderInput) int {
	if input.ItemsCount > 0 {
		return input.ItemsCount
	}
	return len(input.Items)
}
