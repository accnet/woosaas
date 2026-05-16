package orders

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/accnet/woosaas/api/pkg/models"
	"github.com/google/uuid"
)

func shouldPrepareAnalyticsPurchase(input models.WooOrderInput) bool {
	if strings.TrimSpace(input.WooOrderID) == "" {
		return false
	}
	if strings.TrimSpace(input.ClientID) == "" || strings.TrimSpace(input.SessionID) == "" {
		return false
	}
	if strings.TrimSpace(input.Currency) == "" || input.TotalAmount <= 0 {
		return false
	}
	if input.PurchaseTrackedAt != nil && strings.TrimSpace(*input.PurchaseTrackedAt) != "" {
		return false
	}
	if input.DeletedAtWoo != nil && strings.TrimSpace(*input.DeletedAtWoo) != "" {
		return false
	}
	if strings.EqualFold(strings.TrimSpace(input.PaymentStatus), "paid") {
		return true
	}
	return input.PaidAtWoo != nil && strings.TrimSpace(*input.PaidAtWoo) != ""
}

func analyticsPurchaseEventID(siteID, sourcePlatform, wooOrderID string) string {
	seed := fmt.Sprintf("woosaas:purchase:%s:%s:%s", siteID, normalizeSourcePlatform(sourcePlatform), strings.TrimSpace(wooOrderID))
	return uuid.NewSHA1(uuid.NameSpaceURL, []byte(seed)).String()
}

func buildAnalyticsPurchaseEvent(siteID string, input models.WooOrderInput, eventID string) models.Event {
	eventTime := strings.TrimSpace(input.ModifiedAtWoo)
	if input.PaidAtWoo != nil && strings.TrimSpace(*input.PaidAtWoo) != "" {
		eventTime = strings.TrimSpace(*input.PaidAtWoo)
	} else if input.CompletedAtWoo != nil && strings.TrimSpace(*input.CompletedAtWoo) != "" {
		eventTime = strings.TrimSpace(*input.CompletedAtWoo)
	} else if input.CreatedAtWoo != nil && strings.TrimSpace(*input.CreatedAtWoo) != "" {
		eventTime = strings.TrimSpace(*input.CreatedAtWoo)
	}

	path := ""
	if rawURL := strings.TrimSpace(input.OrderStatusURL); rawURL != "" {
		if parsed, err := url.Parse(rawURL); err == nil {
			path = parsed.Path
		}
	}

	items := make([]map[string]interface{}, 0, len(input.Items))
	for _, item := range input.Items {
		items = append(items, map[string]interface{}{
			"line_item_id": item.LineItemID,
			"product_id":   item.ProductID,
			"product_name": item.Name,
			"quantity":     item.Quantity,
			"line_total":   item.LineTotal,
			"sku":          item.SKU,
		})
	}

	return models.Event{
		EventID:     eventID,
		EventTime:   normalizeAnalyticsEventTime(eventTime),
		EventName:   "purchase",
		ClientID:    strings.TrimSpace(input.ClientID),
		SessionID:   strings.TrimSpace(input.SessionID),
		URL:         strings.TrimSpace(input.OrderStatusURL),
		Path:        path,
		Attribution: buildAttribution(input.Attribution),
		OrderID:     strings.TrimSpace(input.WooOrderID),
		Revenue:     input.TotalAmount,
		Currency:    strings.TrimSpace(input.Currency),
		ItemsJSON:   marshalAnalyticsItems(items),
		Properties: map[string]interface{}{
			"order_id":          strings.TrimSpace(input.WooOrderID),
			"currency":          strings.TrimSpace(input.Currency),
			"revenue":           input.TotalAmount,
			"payment_status":    strings.TrimSpace(input.PaymentStatus),
			"source_platform":   normalizeSourcePlatform(input.SourcePlatform),
			"external_order_id": strings.TrimSpace(input.ExternalOrderName),
			"items":             items,
		},
	}
}

func marshalAnalyticsItems(value interface{}) string {
	data, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	return string(data)
}

func normalizeAnalyticsEventTime(value string) string {
	if parsed, err := time.Parse(time.RFC3339Nano, value); err == nil {
		return parsed.UTC().Format(time.RFC3339Nano)
	}
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return parsed.UTC().Format(time.RFC3339Nano)
	}
	return time.Now().UTC().Format(time.RFC3339Nano)
}

func buildAttribution(raw map[string]interface{}) *models.Attribution {
	if len(raw) == 0 {
		return nil
	}
	attr := &models.Attribution{
		Source:   stringMapValue(raw, "source"),
		Medium:   stringMapValue(raw, "medium"),
		Campaign: stringMapValue(raw, "campaign"),
		Term:     stringMapValue(raw, "term"),
		Content:  stringMapValue(raw, "content"),
		GCLID:    stringMapValue(raw, "gclid"),
		FBCLID:   stringMapValue(raw, "fbclid"),
		TTCLID:   stringMapValue(raw, "ttclid"),
		MSCLKID:  stringMapValue(raw, "msclkid"),
	}
	if *attr == (models.Attribution{}) {
		return nil
	}
	return attr
}

func stringMapValue(values map[string]interface{}, key string) string {
	raw, ok := values[key]
	if !ok || raw == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(raw))
}
