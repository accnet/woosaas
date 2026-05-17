package order_status

import (
	"testing"

	"github.com/accnet/woosaas/api/pkg/models"
)

func TestFromOrderInput(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		input models.WooOrderInput
		want  string
	}{
		{
			name: "paid unfulfilled becomes processing",
			input: models.WooOrderInput{
				PaymentStatus:     "paid",
				FulfillmentStatus: "unfulfilled",
			},
			want: StatusProcessing,
		},
		{
			name: "fulfilled order becomes fulfilled",
			input: models.WooOrderInput{
				PaymentStatus:     "paid",
				FulfillmentStatus: "fulfilled",
			},
			want: StatusFulfilled,
		},
		{
			name: "completed fulfilled order becomes delivered",
			input: models.WooOrderInput{
				Status:            "completed",
				PaymentStatus:     "paid",
				FulfillmentStatus: "fulfilled",
			},
			want: StatusDelivered,
		},
		{
			name: "refunded payment wins",
			input: models.WooOrderInput{
				PaymentStatus:     "refunded",
				FulfillmentStatus: "fulfilled",
			},
			want: StatusRefunded,
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := FromOrderInput(tt.input); got != tt.want {
				t.Fatalf("FromOrderInput() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestFromTrackingStatus(t *testing.T) {
	t.Parallel()

	tests := map[string]string{
		"":                    StatusFulfilled,
		"pending":             StatusFulfilled,
		"in_transit":          StatusInTransit,
		"out_for_delivery":    StatusOutForDelivery,
		"delivered":           StatusDelivered,
		"failed_attempt":      StatusFailedDelivery,
		"return_to_sender":    StatusReturned,
		"exception":           StatusException,
		"some_unknown_status": StatusFulfilled,
	}

	for input, want := range tests {
		input, want := input, want
		t.Run(input, func(t *testing.T) {
			t.Parallel()
			if got := FromTrackingStatus(input); got != want {
				t.Fatalf("FromTrackingStatus(%q) = %q, want %q", input, got, want)
			}
		})
	}
}

func TestMerge(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		current   string
		candidate string
		want      string
	}{
		{name: "progress moves forward", current: StatusProcessing, candidate: StatusInTransit, want: StatusInTransit},
		{name: "progress does not move backward", current: StatusDelivered, candidate: StatusFulfilled, want: StatusDelivered},
		{name: "terminal refunded overrides progress", current: StatusDelivered, candidate: StatusRefunded, want: StatusRefunded},
		{name: "terminal cancelled wins over progress", current: StatusProcessing, candidate: StatusCancelled, want: StatusCancelled},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if got := Merge(tt.current, tt.candidate); got != tt.want {
				t.Fatalf("Merge(%q, %q) = %q, want %q", tt.current, tt.candidate, got, tt.want)
			}
		})
	}
}

func TestImpliesFulfilled(t *testing.T) {
	t.Parallel()

	fulfilledStatuses := []string{
		StatusFulfilled,
		StatusInTransit,
		StatusOutForDelivery,
		StatusDelivered,
		StatusException,
		StatusFailedDelivery,
		StatusReturned,
	}
	for _, status := range fulfilledStatuses {
		if !ImpliesFulfilled(status) {
			t.Fatalf("ImpliesFulfilled(%q) = false, want true", status)
		}
	}

	notFulfilledStatuses := []string{
		StatusProcessing,
		StatusCancelled,
		StatusRefunded,
		StatusDeleted,
	}
	for _, status := range notFulfilledStatuses {
		if ImpliesFulfilled(status) {
			t.Fatalf("ImpliesFulfilled(%q) = true, want false", status)
		}
	}
}
