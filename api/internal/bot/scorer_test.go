package bot

import (
	"context"
	"testing"

	"github.com/accnet/woosaas/api/pkg/models"
)

func TestScoreUsesRawClientIPForDatacenterDetection(t *testing.T) {
	scorer := NewScorer(nil)
	score, reasons := scorer.Score(context.Background(), &models.Event{
		UserAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36",
	}, "45.33.10.20")

	if score == 0 {
		t.Fatal("expected non-zero score for datacenter IP")
	}
	found := false
	for _, reason := range reasons {
		if reason == "datacenter_ip" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected datacenter_ip reason, got %v", reasons)
	}
}

func TestScoreIgnoresPrivateIPForDatacenterDetection(t *testing.T) {
	scorer := NewScorer(nil)
	score, reasons := scorer.Score(context.Background(), &models.Event{
		UserAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36",
	}, "127.0.0.1")

	for _, reason := range reasons {
		if reason == "datacenter_ip" {
			t.Fatalf("did not expect datacenter_ip for loopback IP, got %v with score %d", reasons, score)
		}
	}
}
