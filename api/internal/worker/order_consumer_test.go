package worker

import "testing"

func TestStreamReadGroupArgs(t *testing.T) {
	got := streamReadGroupArgs()
	want := []string{eventsStream, "orders:stream", ">", ">"}

	if len(got) != len(want) {
		t.Fatalf("len(streamReadGroupArgs()) = %d, want %d", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("streamReadGroupArgs()[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}
