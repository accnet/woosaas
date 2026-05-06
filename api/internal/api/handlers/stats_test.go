package handlers

import "testing"

func TestParseDateTimeAcceptsISOAndDate(t *testing.T) {
	tests := []string{
		"2026-05-06T15:45:47Z",
		"2026-05-06T15:45:47.123Z",
		"2026-05-06 15:45:47",
		"2026-05-06",
	}

	for _, tt := range tests {
		if _, err := parseDateTime(tt); err != nil {
			t.Fatalf("parseDateTime(%q) returned error: %v", tt, err)
		}
	}
}

func TestFormatClickHouseTime(t *testing.T) {
	parsed, err := parseDateTime("2026-05-06T15:45:47Z")
	if err != nil {
		t.Fatal(err)
	}

	got := formatClickHouseTime(parsed)
	want := "2026-05-06 15:45:47.000"
	if got != want {
		t.Fatalf("formatClickHouseTime() = %q, want %q", got, want)
	}
}
