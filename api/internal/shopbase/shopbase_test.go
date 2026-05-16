package shopbase

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"testing"
	"time"
)

// --- HMAC Tests ---

func computeHMAC(body []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

func TestVerifyHMAC_Valid(t *testing.T) {
	body := []byte(`{"id":12345,"topic":"orders/create"}`)
	secret := "test-webhook-secret"
	sig := computeHMAC(body, secret)

	if !VerifyHMAC(body, sig, secret) {
		t.Fatal("VerifyHMAC should return true for valid HMAC")
	}
}

func TestVerifyHMAC_TamperedBody(t *testing.T) {
	body := []byte(`{"id":12345,"topic":"orders/create"}`)
	secret := "test-webhook-secret"
	sig := computeHMAC(body, secret)

	tampered := []byte(`{"id":99999,"topic":"orders/create"}`)
	if VerifyHMAC(tampered, sig, secret) {
		t.Fatal("VerifyHMAC should return false for tampered body")
	}
}

func TestVerifyHMAC_WrongSecret(t *testing.T) {
	body := []byte(`{"id":12345,"topic":"orders/create"}`)
	sig := computeHMAC(body, "correct-secret")

	if VerifyHMAC(body, sig, "wrong-secret") {
		t.Fatal("VerifyHMAC should return false for wrong secret")
	}
}

func TestVerifyHMAC_EmptySecret(t *testing.T) {
	body := []byte(`{"id":12345}`)
	sig := computeHMAC(body, "")
	if VerifyHMAC(body, sig, "") {
		t.Fatal("VerifyHMAC should return false when secret is empty")
	}
}

func TestVerifyHMAC_EmptyHeader(t *testing.T) {
	body := []byte(`{"id":12345}`)
	if VerifyHMAC(body, "", "some-secret") {
		t.Fatal("VerifyHMAC should return false when header is empty")
	}
}

// --- Mapper Tests ---

func makeOrder() Order {
	now := time.Date(2024, 1, 15, 10, 0, 0, 0, time.UTC)
	paid := time.Date(2024, 1, 15, 10, 5, 0, 0, time.UTC)
	updated := time.Date(2024, 1, 16, 12, 0, 0, 0, time.UTC)

	return Order{
		ID:                123456,
		Name:              "#1001",
		OrderNumber:       1001,
		Email:             "customer@example.com",
		Phone:             "+1234567890",
		Currency:          "USD",
		FinancialStatus:   "paid",
		FulfillmentStatus: "fulfilled",
		TotalPrice:        "99.99",
		SubtotalPrice:     "89.99",
		TotalDiscounts:    "5.00",
		TotalTax:          "5.00",
		CheckoutToken:     "abc-checkout",
		CartToken:         "abc-cart",
		OrderStatusURL:    "https://shop.myshopbase.com/orders/status",
		PaymentGateway:    "paypal",
		ReferringSite:     "https://google.com",
		CreatedAt:         &now,
		ProcessedAt:       &paid,
		UpdatedAt:         &updated,
		Customer: Customer{
			ID:        789,
			FirstName: "John",
			LastName:  "Doe",
		},
		ShippingLines: []ShippingLine{
			{Title: "Standard Shipping", Price: "10.00"},
		},
		LineItems: []LineItem{
			{
				ID:       1,
				Title:    "Test Product",
				SKU:      "SKU-001",
				Quantity: 2,
				Price:    "44.99",
			},
		},
		BillingAddress: Address{
			FirstName: "John",
			LastName:  "Doe",
			Address1:  "123 Main St",
			City:      "New York",
			Country:   "US",
		},
		ShippingAddress: Address{
			FirstName: "John",
			LastName:  "Doe",
			Address1:  "456 Elm St",
			City:      "Brooklyn",
			Country:   "US",
		},
	}
}

func TestMapOrderToInput_BasicFields(t *testing.T) {
	o := makeOrder()
	siteID := "site-abc-123"

	input := MapOrderToInput(o, siteID)

	if input.WooOrderID != "123456" {
		t.Errorf("WooOrderID: got %q, want %q", input.WooOrderID, "123456")
	}
	if input.SourcePlatform != "shopbase" {
		t.Errorf("SourcePlatform: got %q, want %q", input.SourcePlatform, "shopbase")
	}
	if input.ExternalOrderName != "#1001" {
		t.Errorf("ExternalOrderName: got %q, want %q", input.ExternalOrderName, "#1001")
	}
	if input.CustomerEmail != "customer@example.com" {
		t.Errorf("CustomerEmail: got %q", input.CustomerEmail)
	}
	if input.Currency != "USD" {
		t.Errorf("Currency: got %q, want USD", input.Currency)
	}
	if input.PaymentGateway != "paypal" {
		t.Errorf("PaymentGateway: got %q", input.PaymentGateway)
	}
	if input.CheckoutToken != "abc-checkout" {
		t.Errorf("CheckoutToken: got %q", input.CheckoutToken)
	}
	if input.CartToken != "abc-cart" {
		t.Errorf("CartToken: got %q", input.CartToken)
	}
}

func TestMapOrderToInput_Amounts(t *testing.T) {
	o := makeOrder()
	input := MapOrderToInput(o, "site-x")

	if input.TotalAmount != 99.99 {
		t.Errorf("TotalAmount: got %f, want 99.99", input.TotalAmount)
	}
	if input.SubtotalAmount != 89.99 {
		t.Errorf("SubtotalAmount: got %f", input.SubtotalAmount)
	}
	if input.DiscountAmount != 5.00 {
		t.Errorf("DiscountAmount: got %f", input.DiscountAmount)
	}
	if input.TaxAmount != 5.00 {
		t.Errorf("TaxAmount: got %f", input.TaxAmount)
	}
}

func TestMapOrderToInput_DeliveryMethod(t *testing.T) {
	o := makeOrder()
	input := MapOrderToInput(o, "site-x")
	if input.DeliveryMethod != "Standard Shipping" {
		t.Errorf("DeliveryMethod: got %q, want %q", input.DeliveryMethod, "Standard Shipping")
	}
}

func TestMapOrderToInput_PaidAt(t *testing.T) {
	o := makeOrder()
	input := MapOrderToInput(o, "site-x")
	if input.PaidAtWoo == nil {
		t.Fatal("PaidAtWoo should be set for paid order")
	}
}

func TestMapOrderToInput_UnpaidOrder(t *testing.T) {
	o := makeOrder()
	o.FinancialStatus = "pending"
	o.ProcessedAt = nil
	input := MapOrderToInput(o, "site-x")
	if input.PaidAtWoo != nil {
		t.Error("PaidAtWoo should be nil for unpaid order")
	}
}

func TestMapOrderToInput_CancelledOrder(t *testing.T) {
	o := makeOrder()
	cancelled := time.Date(2024, 1, 17, 0, 0, 0, 0, time.UTC)
	o.CancelledAt = &cancelled
	o.FinancialStatus = "voided"

	input := MapOrderToInput(o, "site-x")
	if input.Status != "cancelled" {
		t.Errorf("Status: got %q, want cancelled", input.Status)
	}
}

func TestMapOrderToInput_NoShippingLine(t *testing.T) {
	o := makeOrder()
	o.ShippingLines = nil
	input := MapOrderToInput(o, "site-x")
	if input.DeliveryMethod != "" {
		t.Errorf("DeliveryMethod should be empty when no shipping lines, got %q", input.DeliveryMethod)
	}
}

func TestOrderUnmarshal_MoneySetAmounts(t *testing.T) {
	raw := []byte(`{
		"id": 123,
		"total_price": "99.99",
		"subtotal_price": 89.99,
		"total_discounts": "5.00",
		"total_shipping_price_set": {"shop_money": {"amount": "10.00", "currency_code": "USD"}},
		"total_tax": {"amount": "5.00"},
		"shipping_lines": [{"title": "Standard", "price": {"shop_money": {"amount": "10.00"}}}],
		"line_items": [{"id": 1, "title": "Product", "quantity": 1, "price": {"amount": "99.99"}}]
	}`)
	var o Order
	if err := json.Unmarshal(raw, &o); err != nil {
		t.Fatalf("unmarshal order with money sets: %v", err)
	}
	input := MapOrderToInput(o, "site-x")
	if input.ShippingAmount != 10 {
		t.Fatalf("ShippingAmount: got %f, want 10", input.ShippingAmount)
	}
	if input.TaxAmount != 5 {
		t.Fatalf("TaxAmount: got %f, want 5", input.TaxAmount)
	}
	if len(input.Items) != 1 || input.Items[0].UnitPrice != 99.99 {
		t.Fatalf("Line item price not parsed: %+v", input.Items)
	}
}

func TestMapOrderToInput_LineItemCount(t *testing.T) {
	o := makeOrder()
	input := MapOrderToInput(o, "site-x")
	if input.ItemsCount != 1 {
		t.Errorf("ItemsCount: got %d, want 1", input.ItemsCount)
	}
}

func TestMapShopToMetadata(t *testing.T) {
	shop := Shop{
		ID:              42,
		Name:            "My Shop",
		Domain:          "myshop.onshopbase.com",
		PrimaryDomain:   "myshop.com",
		Currency:        "VND",
		Timezone:        "Asia/Ho_Chi_Minh",
		MyshopifyDomain: "myshop.onshopbase.com",
	}

	meta := MapShopToMetadata(shop)

	if meta.Name != "My Shop" {
		t.Errorf("Name: got %q", meta.Name)
	}
	if meta.Currency != "VND" {
		t.Errorf("Currency: got %q", meta.Currency)
	}
	if meta.PrimaryDomain != "myshop.com" {
		t.Errorf("PrimaryDomain: got %q", meta.PrimaryDomain)
	}
	if meta.ExternalShopID != "42" {
		t.Errorf("ExternalShopID: got %q, want 42", meta.ExternalShopID)
	}
}
