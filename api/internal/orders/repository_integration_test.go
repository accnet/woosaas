package orders

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/accnet/woosaas/api/pkg/models"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestUpsertOrderSnapshotDerivesContactsByEmailAndPhone(t *testing.T) {
	dsn := os.Getenv("ORDERS_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("ORDERS_TEST_DATABASE_URL is not set")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("pgxpool.New() error = %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		t.Fatalf("pool.Ping() error = %v", err)
	}

	repo := NewRepository(pool)
	userID := uuid.New().String()
	siteID := uuid.New().String()
	email := fmt.Sprintf("contact-%s@example.test", uuid.New().String())

	if _, err := pool.Exec(ctx, `
		INSERT INTO users (id, email, password_hash, name)
		VALUES ($1, $2, 'integration-test', 'Order contact integration test')
	`, userID, fmt.Sprintf("owner-%s@example.test", uuid.New().String())); err != nil {
		t.Fatalf("insert user error = %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)

	if _, err := pool.Exec(ctx, `
		INSERT INTO sites (id, user_id, name, domain)
		VALUES ($1, $2, 'Order contact integration site', $3)
	`, siteID, userID, fmt.Sprintf("https://%s.example.test", uuid.New().String())); err != nil {
		t.Fatalf("insert site error = %v", err)
	}
	defer pool.Exec(ctx, `DELETE FROM sites WHERE id = $1`, siteID)

	base := time.Date(2026, 5, 12, 10, 0, 0, 0, time.UTC)
	inputs := []models.WooOrderInput{
		testOrderInput("email-1", email, "+15550000001", 10, base),
		testOrderInput("email-2", email, "+15550000002", 20, base.Add(time.Minute)),
		testOrderInput("phone-1", "", "+15550000999", 30, base.Add(2*time.Minute)),
		testOrderInput("phone-2", "", "+15550000999", 40, base.Add(3*time.Minute)),
	}

	for _, input := range inputs {
		if err := repo.UpsertOrderSnapshot(ctx, siteID, input, true); err != nil {
			t.Fatalf("UpsertOrderSnapshot(%s) error = %v", input.WooOrderID, err)
		}
	}

	var emailContacts, emailOrders int
	var emailSpent float64
	if err := pool.QueryRow(ctx, `
		SELECT COUNT(*), COALESCE(MAX(orders_count), 0), COALESCE(MAX(total_spent)::float8, 0)
		FROM woo_order_contacts
		WHERE site_id = $1 AND email = $2
	`, siteID, email).Scan(&emailContacts, &emailOrders, &emailSpent); err != nil {
		t.Fatalf("query email contact error = %v", err)
	}
	if emailContacts != 1 || emailOrders != 2 || emailSpent != 30 {
		t.Fatalf("email derivation = contacts %d orders %d spent %.2f, want 1 / 2 / 30.00", emailContacts, emailOrders, emailSpent)
	}

	var phoneContacts, phoneOrders int
	var phoneSpent float64
	if err := pool.QueryRow(ctx, `
		SELECT COUNT(*), COALESCE(MAX(orders_count), 0), COALESCE(MAX(total_spent)::float8, 0)
		FROM woo_order_contacts
		WHERE site_id = $1 AND phone = '+15550000999'
	`, siteID).Scan(&phoneContacts, &phoneOrders, &phoneSpent); err != nil {
		t.Fatalf("query phone contact error = %v", err)
	}
	if phoneContacts != 1 || phoneOrders != 2 || phoneSpent != 70 {
		t.Fatalf("phone derivation = contacts %d orders %d spent %.2f, want 1 / 2 / 70.00", phoneContacts, phoneOrders, phoneSpent)
	}
}

func testOrderInput(orderID, email, phone string, total float64, modified time.Time) models.WooOrderInput {
	timestamp := modified.Format(time.RFC3339)
	return models.WooOrderInput{
		WooOrderID:        orderID,
		Status:            "processing",
		PaymentStatus:     "paid",
		FulfillmentStatus: "unfulfilled",
		Currency:          "USD",
		TotalAmount:       total,
		SubtotalAmount:    total,
		ItemsCount:        1,
		CustomerEmail:     email,
		CustomerFirstName: "Test",
		CustomerLastName:  "Buyer",
		CustomerPhone:     phone,
		BillingAddress:    map[string]interface{}{},
		ShippingAddress:   map[string]interface{}{},
		Attribution:       map[string]interface{}{},
		CreatedAtWoo:      &timestamp,
		ModifiedAtWoo:     timestamp,
		Items: []models.WooOrderItemInput{
			{
				LineItemID:   "1",
				ProductID:    "integration-product",
				Name:         "Integration Product",
				Quantity:     1,
				UnitPrice:    total,
				LineSubtotal: total,
				LineTotal:    total,
			},
		},
		RawOrder: map[string]interface{}{},
	}
}
