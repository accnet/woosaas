package worker

import (
	"testing"

	"github.com/accnet/woosaas/api/pkg/models"
)

func TestNormalizeEventPromotesKnownProperties(t *testing.T) {
	event := normalizeEvent(models.Event{
		EventName: "purchase",
		Properties: map[string]interface{}{
			"order_id":     "ord_123",
			"product_id":   float64(42),
			"product_name": "Test Product",
			"quantity":     float64(2),
			"revenue":      "19.95",
			"currency":     "USD",
			"items":        []interface{}{map[string]interface{}{"sku": "abc"}},
		},
	})

	if event.OrderID != "ord_123" {
		t.Fatalf("OrderID = %q", event.OrderID)
	}
	if event.ProductID != "42" {
		t.Fatalf("ProductID = %q", event.ProductID)
	}
	if event.Quantity != 2 {
		t.Fatalf("Quantity = %d", event.Quantity)
	}
	if event.Revenue != 19.95 {
		t.Fatalf("Revenue = %f", event.Revenue)
	}
	if event.ItemsJSON == "" {
		t.Fatal("ItemsJSON was empty")
	}
}

func TestClamp(t *testing.T) {
	if got := clamp(-1, 0, 255); got != 0 {
		t.Fatalf("clamp low = %d", got)
	}
	if got := clamp(300, 0, 255); got != 255 {
		t.Fatalf("clamp high = %d", got)
	}
	if got := clamp(20, 0, 255); got != 20 {
		t.Fatalf("clamp middle = %d", got)
	}
}
