package main

import "testing"

func TestSplitSQLStatementsSkipsCommentsAndEmptyParts(t *testing.T) {
	got := splitSQLStatements(`
-- leading comment
CREATE DATABASE IF NOT EXISTS woosaas;

-- table comment
CREATE TABLE analytics_events (id String);
`)

	if len(got) != 2 {
		t.Fatalf("len(splitSQLStatements) = %d, want 2: %#v", len(got), got)
	}
	if got[0] != "CREATE DATABASE IF NOT EXISTS woosaas" {
		t.Fatalf("first statement = %q", got[0])
	}
	if got[1] != "CREATE TABLE analytics_events (id String)" {
		t.Fatalf("second statement = %q", got[1])
	}
}
