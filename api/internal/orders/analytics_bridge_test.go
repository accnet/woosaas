package orders

import (
	"testing"
	"time"

	"github.com/accnet/woosaas/api/pkg/models"
)

func TestShouldPrepareAnalyticsPurchase(t *testing.T) {
	createdAt := time.Date(2026, 5, 16, 10, 0, 0, 0, time.UTC).Format(time.RFC3339)
	paidAt := time.Date(2026, 5, 16, 10, 5, 0, 0, time.UTC).Format(time.RFC3339)

	input := models.WooOrderInput{
		WooOrderID:    "14738",
		PaymentStatus: "paid",
		Currency:      "USD",
		TotalAmount:   24.94,
		ClientID:      "client-1",
		SessionID:     "session-1",
		CreatedAtWoo:  &createdAt,
		PaidAtWoo:     &paidAt,
	}

	if !shouldPrepareAnalyticsPurchase(input) {
		t.Fatal("expected paid order with session identifiers to prepare purchase")
	}

	trackedAt := time.Date(2026, 5, 16, 10, 6, 0, 0, time.UTC).Format(time.RFC3339)
	input.PurchaseTrackedAt = &trackedAt
	if shouldPrepareAnalyticsPurchase(input) {
		t.Fatal("expected already tracked purchase to skip bridge")
	}
	input.PurchaseTrackedAt = nil

	input.SessionID = ""
	if shouldPrepareAnalyticsPurchase(input) {
		t.Fatal("expected missing session_id to skip purchase bridge")
	}
}

func TestBuildAnalyticsPurchaseEvent(t *testing.T) {
	createdAt := time.Date(2026, 5, 16, 10, 0, 0, 0, time.UTC).Format(time.RFC3339)
	paidAt := time.Date(2026, 5, 16, 10, 5, 0, 0, time.UTC).Format(time.RFC3339)
	eventID := analyticsPurchaseEventID("site-1", "woocommerce", "14739")

	event := buildAnalyticsPurchaseEvent("site-1", models.WooOrderInput{
		WooOrderID:     "14739",
		PaymentStatus:  "paid",
		Currency:       "USD",
		TotalAmount:    24.94,
		ClientID:       "client-1",
		SessionID:      "session-1",
		OrderStatusURL: "https://site1.local/checkout/order-received/14739",
		Attribution: map[string]interface{}{
			"source": "site1.local",
			"medium": "referral",
		},
		CreatedAtWoo: &createdAt,
		PaidAtWoo:    &paidAt,
		Items: []models.WooOrderItemInput{{
			LineItemID: "1",
			ProductID:  "13787",
			Name:       "Test product",
			Quantity:   1,
			LineTotal:  24.94,
		}},
	}, eventID)

	if event.EventID != eventID {
		t.Fatalf("EventID = %q", event.EventID)
	}
	if event.EventName != "purchase" {
		t.Fatalf("EventName = %q", event.EventName)
	}
	if event.OrderID != "14739" {
		t.Fatalf("OrderID = %q", event.OrderID)
	}
	if event.Path != "/checkout/order-received/14739" {
		t.Fatalf("Path = %q", event.Path)
	}
	if event.Attribution == nil || event.Attribution.Source != "site1.local" {
		t.Fatal("expected attribution to be preserved")
	}
	if event.ItemsJSON == "" {
		t.Fatal("expected ItemsJSON to be populated")
	}
}
