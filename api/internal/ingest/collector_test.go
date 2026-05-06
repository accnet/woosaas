package ingest

import (
	"context"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"github.com/woosaas/api/pkg/models"
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
