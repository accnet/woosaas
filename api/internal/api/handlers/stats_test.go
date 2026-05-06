package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

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

func TestGetBotsRequiresSiteAndDateRange(t *testing.T) {
	gin.SetMode(gin.TestMode)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/v1/stats/bots", nil)

	handler := &StatsHandler{}
	handler.GetBots(ctx)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("GetBots() status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}
}
