package orders

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/accnet/woosaas/api/pkg/models"
)

// ExportOrdersParams controls which orders to include in an export.
type ExportOrdersParams struct {
	ListOrdersParams
	// OrderIDs, when non-empty, restricts export to only these order IDs.
	// Other filters are still applied as an AND condition.
	OrderIDs []string
}

// FetchOrdersForExport loads a page of full order detail rows for export.
// It returns a slice of *WooOrderDetail (with Items populated) and the total count.
// Batch size is limited to avoid memory issues; caller iterates by page.
func (r *Repository) FetchOrdersForExport(ctx context.Context, params ExportOrdersParams) ([]*models.WooOrderDetail, int, error) {
	// Cap page size — never load more than 500 full orders at once
	pageSize := params.PageSize
	if pageSize <= 0 || pageSize > 500 {
		pageSize = 500
	}
	page := params.Page
	if page < 1 {
		page = 1
	}

	where, args := buildOrderListWhere(params.ListOrdersParams)

	// Restrict to specific order IDs if provided
	if len(params.OrderIDs) > 0 {
		placeholders := make([]string, len(params.OrderIDs))
		for i, id := range params.OrderIDs {
			placeholders[i] = fmt.Sprintf("$%d", len(args)+1+i)
			args = append(args, id)
		}
		where += " AND woo_order_id IN (" + strings.Join(placeholders, ",") + ")"
	}

	// Count
	var total int
	if err := r.db.QueryRow(ctx, "SELECT COUNT(*) FROM commerce_orders WHERE "+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	args = append(args, pageSize, (page-1)*pageSize)
	sql := `
		SELECT id, site_id, woo_order_id, COALESCE(source_platform,'woocommerce'), COALESCE(woo_customer_id,''), status,
			COALESCE(payment_status,''), COALESCE(fulfillment_status,''), currency,
			total_amount::float8, subtotal_amount::float8, discount_amount::float8,
			shipping_amount::float8, tax_amount::float8, refund_amount::float8, items_count,
			COALESCE(customer_email,''), COALESCE(customer_first_name,''), COALESCE(customer_last_name,''),
			COALESCE(customer_phone,''), COALESCE(billing_company,''),
			billing_address_json, shipping_address_json,
			COALESCE(client_id,''), COALESCE(session_id,''), attribution_json,
			created_at_woo, paid_at_woo, completed_at_woo, modified_at_woo, deleted_at_woo,
			COALESCE(delivery_method,'')
		FROM commerce_orders
		WHERE ` + where + `
		ORDER BY created_at_woo DESC NULLS LAST, woo_order_id DESC
		LIMIT $` + fmt.Sprint(len(args)-1) + ` OFFSET $` + fmt.Sprint(len(args))

	rows, err := r.db.Query(ctx, sql, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var orders []*models.WooOrderDetail
	var orderIDs []string

	for rows.Next() {
		var o models.WooOrderDetail
		var billingJSON, shippingJSON, attributionJSON []byte
		if err := rows.Scan(
			&o.ID, &o.SiteID, &o.WooOrderID, &o.SourcePlatform, &o.WooCustomerID, &o.Status,
			&o.PaymentStatus, &o.FulfillmentStatus, &o.Currency,
			&o.TotalAmount, &o.SubtotalAmount, &o.DiscountAmount,
			&o.ShippingAmount, &o.TaxAmount, &o.RefundAmount, &o.ItemsCount,
			&o.CustomerEmail, &o.CustomerFirstName, &o.CustomerLastName,
			&o.CustomerPhone, &o.BillingCompany,
			&billingJSON, &shippingJSON,
			&o.ClientID, &o.SessionID, &attributionJSON,
			&o.CreatedAtWoo, &o.PaidAtWoo, &o.CompletedAtWoo, &o.ModifiedAtWoo, &o.DeletedAtWoo,
			&o.DeliveryMethod,
		); err != nil {
			return nil, 0, err
		}
		o.BillingAddress = unmarshalMap(billingJSON)
		o.ShippingAddress = unmarshalMap(shippingJSON)
		o.Attribution = unmarshalMap(attributionJSON)
		o.Items = []models.WooOrderItem{}
		orders = append(orders, &o)
		orderIDs = append(orderIDs, o.WooOrderID)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	if len(orderIDs) == 0 {
		return orders, total, nil
	}

	// Fetch all items for this batch in a single query
	itemsByOrder, err := r.fetchItemsForOrders(ctx, params.SiteID, orderIDs)
	if err != nil {
		return nil, 0, err
	}
	for _, o := range orders {
		if items, ok := itemsByOrder[orderItemKey(o.SourcePlatform, o.WooOrderID)]; ok {
			o.Items = items
		}
	}

	return orders, total, nil
}

func (r *Repository) fetchItemsForOrders(ctx context.Context, siteID string, orderIDs []string) (map[string][]models.WooOrderItem, error) {
	placeholders := make([]string, len(orderIDs))
	args := make([]interface{}, len(orderIDs)+1)
	args[0] = siteID
	for i, id := range orderIDs {
		placeholders[i] = fmt.Sprintf("$%d", i+2)
		args[i+1] = id
	}

	rows, err := r.db.Query(ctx, `
		SELECT COALESCE(source_platform, 'woocommerce'), woo_order_id, line_item_id, COALESCE(product_id,''), COALESCE(variation_id,''),
			COALESCE(sku,''), COALESCE(name,''), quantity,
			unit_price::float8, line_subtotal::float8, line_total::float8, line_tax::float8,
			COALESCE(external_variant_id,''), variant_attributes_json
		FROM commerce_order_items
		WHERE site_id = $1 AND woo_order_id IN (`+strings.Join(placeholders, ",")+`)
		ORDER BY source_platform, woo_order_id, created_at ASC, line_item_id ASC
	`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string][]models.WooOrderItem)
	for rows.Next() {
		var sourcePlatform, oid string
		var item models.WooOrderItem
		var varAttrsJSON []byte
		if err := rows.Scan(
			&sourcePlatform, &oid, &item.LineItemID, &item.ProductID, &item.VariationID,
			&item.SKU, &item.Name, &item.Quantity,
			&item.UnitPrice, &item.LineSubtotal, &item.LineTotal, &item.LineTax,
			&item.ExternalVariantID, &varAttrsJSON,
		); err != nil {
			return nil, err
		}
		if len(varAttrsJSON) > 0 {
			_ = json.Unmarshal(varAttrsJSON, &item.VariantAttributes)
		}
		result[orderItemKey(sourcePlatform, oid)] = append(result[orderItemKey(sourcePlatform, oid)], item)
	}
	return result, rows.Err()
}

func orderItemKey(sourcePlatform, orderID string) string {
	return sourcePlatform + "\x00" + orderID
}
