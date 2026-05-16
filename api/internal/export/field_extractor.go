package export

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/accnet/woosaas/api/pkg/models"
)

const exportDateLayout = "2006-01-02 15:04:05"

// ExportRow bundles one order with one optional item for flatten output.
type ExportRow struct {
	Order *models.WooOrderDetail
	Item  *models.WooOrderItem // nil when no item_* columns used
}

// HasItemColumns returns true when any column in the template maps to an item field.
func HasItemColumns(cols []models.TemplateColumn) bool {
	for _, c := range cols {
		if c.Type == models.TemplateColumnOrderField && strings.HasPrefix(c.Key, "item_") {
			return true
		}
	}
	return false
}

// ExtractField resolves a TemplateColumn to its string value for a given row.
func ExtractField(col models.TemplateColumn, row ExportRow) string {
	if col.Type == models.TemplateColumnCustom {
		return col.DefaultValue
	}

	o := row.Order
	item := row.Item

	switch col.Key {
	// ── Order ──────────────────────────────────────────────────────────────
	case "order_id":
		return o.WooOrderID
	case "order_date":
		return formatTime(o.CreatedAtWoo)
	case "status":
		return o.Status
	case "payment_status":
		return o.PaymentStatus
	case "fulfillment_status":
		return o.FulfillmentStatus

	// ── Amounts ────────────────────────────────────────────────────────────
	case "subtotal":
		return formatFloat(o.SubtotalAmount)
	case "shipping_amount":
		return formatFloat(o.ShippingAmount)
	case "tax_amount":
		return formatFloat(o.TaxAmount)
	case "discount_amount":
		return formatFloat(o.DiscountAmount)
	case "total_amount":
		return formatFloat(o.TotalAmount)
	case "refund_amount":
		return formatFloat(o.RefundAmount)
	case "currency":
		return o.Currency

	// ── Dates ──────────────────────────────────────────────────────────────
	case "created_at":
		return formatTime(o.CreatedAtWoo)
	case "paid_at":
		return formatTime(o.PaidAtWoo)
	case "completed_at":
		return formatTime(o.CompletedAtWoo)
	case "fulfilled_at":
		return "" // not stored yet
	case "fulfillment_note":
		return "" // not stored yet

	// ── Customer ───────────────────────────────────────────────────────────
	case "customer_name":
		return strings.TrimSpace(o.CustomerFirstName + " " + o.CustomerLastName)
	case "customer_email":
		return o.CustomerEmail
	case "customer_phone":
		return o.CustomerPhone
	case "customer_company":
		return o.BillingCompany

	// ── Billing Address ────────────────────────────────────────────────────
	case "billing_name":
		fn := mapStr(o.BillingAddress, "first_name")
		ln := mapStr(o.BillingAddress, "last_name")
		return strings.TrimSpace(fn + " " + ln)
	case "billing_address1":
		return mapStr(o.BillingAddress, "address_1")
	case "billing_address2":
		return mapStr(o.BillingAddress, "address_2")
	case "billing_city":
		return mapStr(o.BillingAddress, "city")
	case "billing_state":
		return mapStr(o.BillingAddress, "state")
	case "billing_postcode":
		return mapStr(o.BillingAddress, "postcode")
	case "billing_country":
		return mapStr(o.BillingAddress, "country")

	// ── Shipping Address ───────────────────────────────────────────────────
	case "shipping_name":
		fn := mapStr(o.ShippingAddress, "first_name")
		ln := mapStr(o.ShippingAddress, "last_name")
		return strings.TrimSpace(fn + " " + ln)
	case "shipping_address1":
		return mapStr(o.ShippingAddress, "address_1")
	case "shipping_address2":
		return mapStr(o.ShippingAddress, "address_2")
	case "shipping_city":
		return mapStr(o.ShippingAddress, "city")
	case "shipping_state":
		return mapStr(o.ShippingAddress, "state")
	case "shipping_postcode":
		return mapStr(o.ShippingAddress, "postcode")
	case "shipping_country":
		return mapStr(o.ShippingAddress, "country")

	// ── Delivery & Tracking ────────────────────────────────────────────────
	case "delivery_method":
		return o.DeliveryMethod
	case "tracking_number", "tracking_carrier", "tracking_url":
		return "" // future feature

	// ── Attribution ────────────────────────────────────────────────────────
	case "source":
		return mapStr(o.Attribution, "source")
	case "medium":
		return mapStr(o.Attribution, "medium")
	case "campaign":
		return mapStr(o.Attribution, "campaign")
	case "client_id":
		return o.ClientID
	case "session_id":
		return o.SessionID

	// ── Item (only meaningful when Item != nil) ────────────────────────────
	case "item_name":
		if item != nil {
			return item.Name
		}
		return ""
	case "item_sku":
		if item != nil {
			return item.SKU
		}
		return ""
	case "item_variation":
		if item != nil {
			return formatVariantAttrs(item.VariantAttributes)
		}
		return ""
	case "item_qty":
		if item != nil {
			return fmt.Sprintf("%d", item.Quantity)
		}
		return ""
	case "item_unit_price":
		if item != nil {
			return formatFloat(item.UnitPrice)
		}
		return ""
	case "item_line_subtotal":
		if item != nil {
			return formatFloat(item.LineSubtotal)
		}
		return ""
	case "item_line_total":
		if item != nil {
			return formatFloat(item.LineTotal)
		}
		return ""
	case "item_line_tax":
		if item != nil {
			return formatFloat(item.LineTax)
		}
		return ""
	}

	return ""
}

// BuildRows flattens one order + its items according to the template.
func BuildRows(order *models.WooOrderDetail, cols []models.TemplateColumn) [][]string {
	hasItem := HasItemColumns(cols)

	buildRow := func(row ExportRow) []string {
		cells := make([]string, len(cols))
		for i, col := range cols {
			cells[i] = ExtractField(col, row)
		}
		return cells
	}

	if !hasItem || len(order.Items) == 0 {
		return [][]string{buildRow(ExportRow{Order: order})}
	}

	rows := make([][]string, 0, len(order.Items))
	for i := range order.Items {
		rows = append(rows, buildRow(ExportRow{Order: order, Item: &order.Items[i]}))
	}
	return rows
}

// ── helpers ──────────────────────────────────────────────────────────────────

func formatTime(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.UTC().Format(exportDateLayout)
}

func formatFloat(f float64) string {
	return fmt.Sprintf("%.2f", f)
}

func mapStr(m map[string]interface{}, key string) string {
	if m == nil {
		return ""
	}
	v, _ := m[key].(string)
	return v
}

func formatVariantAttrs(attrs map[string]interface{}) string {
	if len(attrs) == 0 {
		return ""
	}
	parts := make([]string, 0, len(attrs))
	for k, v := range attrs {
		parts = append(parts, fmt.Sprintf("%s: %v", k, v))
	}
	return strings.Join(parts, ", ")
}

// HeaderRow returns the CSV header labels from the template.
func HeaderRow(cols []models.TemplateColumn) []string {
	headers := make([]string, len(cols))
	for i, c := range cols {
		headers[i] = c.Label
	}
	return headers
}

// MarshalJSON re-export for internal use.
var _ = json.Marshal
