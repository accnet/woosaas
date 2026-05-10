package handlers

import (
	"testing"

	"github.com/woosaas/api/pkg/models"
)

func TestValidateWooOrderRequiresMandatoryFields(t *testing.T) {
	valid := models.WooOrderInput{
		WooOrderID:    "10001",
		Status:        "processing",
		Currency:      "THB",
		ModifiedAtWoo: "2026-05-10T01:45:00Z",
		Items: []models.WooOrderItemInput{
			{LineItemID: "1", Quantity: 1},
		},
	}

	tests := []struct {
		name    string
		mutate  func(*models.WooOrderInput)
		wantErr string
	}{
		{
			name: "missing woo_order_id",
			mutate: func(input *models.WooOrderInput) {
				input.WooOrderID = ""
			},
			wantErr: "woo_order_id is required",
		},
		{
			name: "missing modified_at_woo",
			mutate: func(input *models.WooOrderInput) {
				input.ModifiedAtWoo = ""
			},
			wantErr: "modified_at_woo is required",
		},
		{
			name: "missing status",
			mutate: func(input *models.WooOrderInput) {
				input.Status = ""
			},
			wantErr: "status is required",
		},
		{
			name: "missing currency",
			mutate: func(input *models.WooOrderInput) {
				input.Currency = ""
			},
			wantErr: "currency is required",
		},
		{
			name: "missing items",
			mutate: func(input *models.WooOrderInput) {
				input.Items = nil
			},
			wantErr: "items is required",
		},
		{
			name: "invalid modified_at_woo",
			mutate: func(input *models.WooOrderInput) {
				input.ModifiedAtWoo = "not-a-time"
			},
			wantErr: "modified_at_woo is invalid",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			input := valid
			tt.mutate(&input)
			err := validateWooOrder(input)
			if err == nil || err.Error() != tt.wantErr {
				t.Fatalf("validateWooOrder() error = %v, want %q", err, tt.wantErr)
			}
		})
	}
}

func TestHeaderBoolDefault(t *testing.T) {
	if !headerBoolDefault("", true) {
		t.Fatal("expected empty value to use fallback true")
	}
	if headerBoolDefault("false", true) {
		t.Fatal("expected false to parse as false")
	}
	if !headerBoolDefault("yes", false) {
		t.Fatal("expected yes to parse as true")
	}
}
