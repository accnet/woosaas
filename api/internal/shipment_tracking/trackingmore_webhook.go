package shipment_tracking

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

func ParseTrackingMoreWebhook(raw []byte) ([]ProviderStatusUpdate, error) {
	var payload any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, err
	}
	items := unwrapWebhookItems(payload)
	updates := make([]ProviderStatusUpdate, 0, len(items))
	for _, item := range items {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		itemRaw, _ := json.Marshal(m)
		statusRaw := pickStringDeep(m, "status", "delivery_status", "shipment_status", "tag", "substatus")
		update := ProviderStatusUpdate{
			Provider:           ProviderTrackingMore,
			ProviderTrackingID: pickStringDeep(m, "id", "tracking_id", "provider_tracking_id"),
			TrackingNumber:     pickStringDeep(m, "tracking_number", "trackingNumber"),
			CarrierSlug:        pickStringDeep(m, "carrier_code", "courier_code", "slug"),
			Status:             normalizeTrackingMoreStatus(statusRaw),
			StatusRaw:          statusRaw,
			TrackingURL:        pickStringDeep(m, "tracking_url", "track_url"),
			LastCheckpointAt:   parseWebhookTime(pickStringDeep(m, "checkpoint_date", "latest_checkpoint_time", "latest_event_time", "lastEventTime", "update_date")),
			RawPayload:         itemRaw,
		}
		if update.TrackingNumber == "" {
			continue
		}
		if update.Status == "" {
			update.Status = StatusFulfilled
		}
		updates = append(updates, update)
	}
	return updates, nil
}

func unwrapWebhookItems(payload any) []any {
	switch v := payload.(type) {
	case []any:
		return v
	case map[string]any:
		for _, key := range []string{"data", "trackings", "tracking", "items"} {
			child, ok := v[key]
			if !ok {
				continue
			}
			switch c := child.(type) {
			case []any:
				return c
			case map[string]any:
				return []any{c}
			}
		}
		return []any{v}
	default:
		return nil
	}
}

func pickStringDeep(m map[string]any, keys ...string) string {
	for _, key := range keys {
		if v := pickString(m, key); v != "" {
			return v
		}
	}
	for _, child := range m {
		switch c := child.(type) {
		case map[string]any:
			if v := pickStringDeep(c, keys...); v != "" {
				return v
			}
		case []any:
			for _, item := range c {
				if obj, ok := item.(map[string]any); ok {
					if v := pickStringDeep(obj, keys...); v != "" {
						return v
					}
				}
			}
		}
	}
	return ""
}

func pickString(m map[string]any, key string) string {
	for k, v := range m {
		if !strings.EqualFold(k, key) {
			continue
		}
		switch vv := v.(type) {
		case string:
			return strings.TrimSpace(vv)
		case float64:
			return fmt.Sprintf("%.0f", vv)
		}
	}
	return ""
}

func normalizeTrackingMoreStatus(status string) string {
	s := strings.ToLower(strings.NewReplacer(" ", "_", "-", "_").Replace(strings.TrimSpace(status)))
	switch s {
	case "delivered":
		return StatusDelivered
	case "in_transit", "transit", "pickup", "not_yet_delivered":
		return StatusInTransit
	case "out_for_delivery":
		return StatusOutForDelivery
	case "exception", "expired", "notfound", "not_found":
		return StatusException
	case "failed_attempt", "failed_delivery":
		return StatusFailedDelivery
	case "returned", "return":
		return StatusReturned
	case "pending", "info_received", "pre_transit":
		return StatusFulfilled
	default:
		if strings.Contains(s, "deliver") && strings.Contains(s, "out") {
			return StatusOutForDelivery
		}
		if strings.Contains(s, "deliver") {
			return StatusDelivered
		}
		if strings.Contains(s, "transit") {
			return StatusInTransit
		}
		if strings.Contains(s, "exception") {
			return StatusException
		}
		return ""
	}
}

func parseWebhookTime(v string) *time.Time {
	v = strings.TrimSpace(v)
	if v == "" {
		return nil
	}
	layouts := []string{time.RFC3339, "2006-01-02 15:04:05", "2006/01/02 15:04:05", "2006-01-02"}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, v); err == nil {
			return &t
		}
	}
	return nil
}
