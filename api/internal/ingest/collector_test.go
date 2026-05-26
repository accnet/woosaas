package ingest

import (
	"context"
	"testing"

	"github.com/accnet/woosaas/api/pkg/models"
	"github.com/alicebob/miniredis/v2"
	"github.com/mssola/useragent"
	"github.com/redis/go-redis/v9"
)

func TestValidateEventRequiresPurchaseFields(t *testing.T) {
	collector := NewCollector(redis.NewClient(&redis.Options{Addr: "127.0.0.1:0"}))

	err := collector.ValidateEvent(&models.Event{
		EventID:   "7a3cc52d-8307-4935-8bf7-7d16e53270ce",
		EventTime: "2026-05-07T10:00:00Z",
		EventName: "purchase",
		ClientID:  "client_1",
		SessionID: "session_1",
		Currency:  "USD",
		Revenue:   49.99,
	})
	if err == nil {
		t.Fatal("expected purchase validation to fail without order_id")
	}
}

func TestValidateEventAllowsPropertyFallbackForAddToCart(t *testing.T) {
	collector := NewCollector(redis.NewClient(&redis.Options{Addr: "127.0.0.1:0"}))

	err := collector.ValidateEvent(&models.Event{
		EventID:   "7a3cc52d-8307-4935-8bf7-7d16e53270ce",
		EventTime: "2026-05-07T10:00:00Z",
		EventName: "add_to_cart",
		ClientID:  "client_1",
		SessionID: "session_1",
		Properties: map[string]interface{}{
			"product_id": "prod_1",
			"quantity":   float64(2),
		},
	})
	if err != nil {
		t.Fatalf("expected add_to_cart validation to succeed: %v", err)
	}
}

func TestDeduplicateReturnsTrueOnSecondSeenEvent(t *testing.T) {
	redisServer, err := miniredis.Run()
	if err != nil {
		t.Fatalf("failed to start miniredis: %v", err)
	}
	defer redisServer.Close()

	collector := NewCollector(redis.NewClient(&redis.Options{Addr: redisServer.Addr()}))
	ctx := context.Background()

	duplicate, err := collector.Deduplicate(ctx, "site_1", "event_1")
	if err != nil {
		t.Fatalf("first dedupe check returned error: %v", err)
	}
	if duplicate {
		t.Fatal("expected first event occurrence to be unique")
	}

	duplicate, err = collector.Deduplicate(ctx, "site_1", "event_1")
	if err != nil {
		t.Fatalf("second dedupe check returned error: %v", err)
	}
	if !duplicate {
		t.Fatal("expected second event occurrence to be duplicate")
	}
}

func TestEnrichEventMapsBrowserVersionOSAndDevice(t *testing.T) {
	collector := NewCollector(redis.NewClient(&redis.Options{Addr: "127.0.0.1:0"}))
	event := &models.Event{
		UserAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
	}

	collector.enrichEvent(event, RequestMetadata{
		IPHash:   "hashed-ip",
		Country:  "US",
		City:     "New York",
		ClientIP: "8.8.8.8",
	})

	if event.Browser == "" {
		t.Fatal("expected Browser to be set")
	}
	if event.BrowserVersion == "" {
		t.Fatal("expected BrowserVersion to be set")
	}
	if event.OS == "" {
		t.Fatal("expected OS to be set")
	}
	if event.DeviceType != "mobile" {
		t.Fatalf("expected DeviceType=mobile, got %q", event.DeviceType)
	}
	if event.Country != "US" || event.City != "New York" {
		t.Fatalf("expected geo fields to be enriched, got country=%q city=%q", event.Country, event.City)
	}
	if event.IPHash != "hashed-ip" {
		t.Fatalf("expected IPHash to be set, got %q", event.IPHash)
	}
}

func TestDetectDeviceTypeRecognizesTablet(t *testing.T) {
	rawUA := "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
	ua := useragent.New(rawUA)
	if got := detectDeviceType(ua, rawUA); got != "tablet" {
		t.Fatalf("expected tablet, got %q", got)
	}
}
