package worker

import "testing"

func TestOrderIDFromPayload(t *testing.T) {
	tests := []struct {
		name string
		body string
		want int64
	}{
		{name: "direct order id", body: `{"id": 9, "order_id": 123}`, want: 123},
		{name: "nested order id", body: `{"id": 9, "order": {"id": 456}}`, want: 456},
		{name: "missing", body: `{"id": 9}`, want: 0},
		{name: "invalid json", body: `{`, want: 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := orderIDFromPayload([]byte(tt.body))
			if got != tt.want {
				t.Fatalf("orderIDFromPayload() = %d, want %d", got, tt.want)
			}
		})
	}
}
