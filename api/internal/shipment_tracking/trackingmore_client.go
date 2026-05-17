package shipment_tracking

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const defaultTrackingMoreBaseURL = "https://api.trackingmore.com/v2"

type TrackingMoreClient struct {
	baseURL string
	apiKey  string
	client  *http.Client
}

type TrackingMoreCreateInput struct {
	TrackingNumber string
	CarrierCode    string
	OrderID        string
	Title          string
}

type TrackingMoreCreateResult struct {
	ProviderTrackingID string
	TrackingNumber     string
	CarrierCode        string
	StatusRaw          string
	TrackingURL        string
}

func NewTrackingMoreClient(baseURL, apiKey string) *TrackingMoreClient {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		baseURL = defaultTrackingMoreBaseURL
	}
	return &TrackingMoreClient{
		baseURL: baseURL,
		apiKey:  strings.TrimSpace(apiKey),
		client:  &http.Client{Timeout: 12 * time.Second},
	}
}

func (c *TrackingMoreClient) CreateTracking(ctx context.Context, input TrackingMoreCreateInput) (*TrackingMoreCreateResult, error) {
	if c.apiKey == "" {
		return nil, fmt.Errorf("trackingmore api key is not configured")
	}
	if strings.TrimSpace(input.TrackingNumber) == "" {
		return nil, fmt.Errorf("tracking number is required")
	}
	if strings.TrimSpace(input.CarrierCode) == "" {
		return nil, fmt.Errorf("carrier_slug is required for TrackingMore registration")
	}

	payload := map[string]string{
		"tracking_number": strings.TrimSpace(input.TrackingNumber),
		"carrier_code":    strings.TrimSpace(input.CarrierCode),
	}
	if strings.TrimSpace(input.OrderID) != "" {
		payload["order_id"] = strings.TrimSpace(input.OrderID)
	}
	if strings.TrimSpace(input.Title) != "" {
		payload["title"] = strings.TrimSpace(input.Title)
	}
	body, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/trackings/post", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Trackingmore-Api-Key", c.apiKey)

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("trackingmore create failed: status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	var decoded map[string]any
	_ = json.Unmarshal(respBody, &decoded)
	return &TrackingMoreCreateResult{
		ProviderTrackingID: firstString(decoded, "id", "data.id", "meta.id"),
		TrackingNumber:     input.TrackingNumber,
		CarrierCode:        input.CarrierCode,
		StatusRaw:          firstString(decoded, "status", "data.status", "data.delivery_status", "data.tag"),
		TrackingURL:        firstString(decoded, "tracking_url", "data.tracking_url", "data.track_url"),
	}, nil
}

func (c *TrackingMoreClient) CreateTrackingsBatch(ctx context.Context, inputs []TrackingMoreCreateInput) ([]TrackingMoreCreateResult, error) {
	if c.apiKey == "" {
		return nil, fmt.Errorf("trackingmore api key is not configured")
	}
	if len(inputs) == 0 {
		return nil, nil
	}
	if len(inputs) > 40 {
		return nil, fmt.Errorf("trackingmore batch accepts at most 40 trackings")
	}

	payload := make([]map[string]string, 0, len(inputs))
	for _, input := range inputs {
		trackingNumber := strings.TrimSpace(input.TrackingNumber)
		carrierCode := strings.TrimSpace(input.CarrierCode)
		if trackingNumber == "" || carrierCode == "" {
			return nil, fmt.Errorf("tracking_number and carrier_code are required")
		}
		item := map[string]string{
			"tracking_number": trackingNumber,
			"carrier_code":    carrierCode,
		}
		if strings.TrimSpace(input.OrderID) != "" {
			item["order_id"] = strings.TrimSpace(input.OrderID)
		}
		if strings.TrimSpace(input.Title) != "" {
			item["title"] = strings.TrimSpace(input.Title)
		}
		payload = append(payload, item)
	}
	body, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/trackings/batch", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Trackingmore-Api-Key", c.apiKey)

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("trackingmore batch create failed: status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	results := make([]TrackingMoreCreateResult, 0, len(inputs))
	var decoded map[string]any
	if err := json.Unmarshal(respBody, &decoded); err == nil {
		for _, item := range unwrapResponseItems(decoded) {
			obj, ok := item.(map[string]any)
			if !ok {
				continue
			}
			results = append(results, TrackingMoreCreateResult{
				ProviderTrackingID: firstString(obj, "id", "data.id", "meta.id"),
				TrackingNumber:     firstString(obj, "tracking_number", "data.tracking_number"),
				CarrierCode:        firstString(obj, "carrier_code", "data.carrier_code"),
				StatusRaw:          firstString(obj, "status", "delivery_status", "tag"),
				TrackingURL:        firstString(obj, "tracking_url", "track_url"),
			})
		}
	}
	if len(results) == 0 {
		for _, input := range inputs {
			results = append(results, TrackingMoreCreateResult{
				TrackingNumber: input.TrackingNumber,
				CarrierCode:    input.CarrierCode,
			})
		}
	}
	return results, nil
}

func firstString(m map[string]any, paths ...string) string {
	for _, path := range paths {
		if v := valueAtPath(m, path); v != "" {
			return v
		}
	}
	return ""
}

func valueAtPath(m map[string]any, path string) string {
	var cur any = m
	for _, part := range strings.Split(path, ".") {
		obj, ok := cur.(map[string]any)
		if !ok {
			return ""
		}
		cur = obj[part]
	}
	switch v := cur.(type) {
	case string:
		return strings.TrimSpace(v)
	case float64:
		return fmt.Sprintf("%.0f", v)
	default:
		return ""
	}
}

func unwrapResponseItems(m map[string]any) []any {
	for _, key := range []string{"data", "trackings", "items"} {
		child, ok := m[key]
		if !ok {
			continue
		}
		if arr, ok := child.([]any); ok {
			return arr
		}
	}
	return nil
}
