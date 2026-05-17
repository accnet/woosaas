package sites

import (
	"context"
	"errors"
	"testing"

	"github.com/accnet/woosaas/api/internal/observability"
)

type stubSiteDataRepo struct {
	deleteCalls []string
	resetCalls  []string
	deleteErr   error
	resetErr    error
}

func (s *stubSiteDataRepo) DeleteSite(_ context.Context, id string) error {
	s.deleteCalls = append(s.deleteCalls, id)
	return s.deleteErr
}

func (s *stubSiteDataRepo) ResetSiteData(_ context.Context, id string) error {
	s.resetCalls = append(s.resetCalls, id)
	return s.resetErr
}

type stubClickHouseConn struct {
	queries []string
	args    [][]interface{}
	err     error
}

func (s *stubClickHouseConn) Exec(_ context.Context, query string, args ...interface{}) error {
	s.queries = append(s.queries, query)
	s.args = append(s.args, args)
	return s.err
}

func TestDeleteSiteWithDataDeletesAnalyticsBeforePostgres(t *testing.T) {
	repo := &stubSiteDataRepo{}
	ch := &stubClickHouseConn{}
	svc := &SiteDataService{repo: repo, ch: ch, logger: observability.NewStructuredLogger()}

	if err := svc.DeleteSiteWithData(context.Background(), "site-1"); err != nil {
		t.Fatalf("DeleteSiteWithData() error = %v", err)
	}

	if len(ch.queries) != 1 {
		t.Fatalf("expected 1 clickhouse mutation, got %d", len(ch.queries))
	}
	if len(repo.deleteCalls) != 1 || repo.deleteCalls[0] != "site-1" {
		t.Fatalf("expected postgres delete for site-1, got %#v", repo.deleteCalls)
	}
	if len(ch.args) != 1 || len(ch.args[0]) != 1 || ch.args[0][0] != "site-1" {
		t.Fatalf("expected site-1 clickhouse arg, got %#v", ch.args)
	}
}

func TestDeleteSiteWithDataStopsWhenClickHouseFails(t *testing.T) {
	repo := &stubSiteDataRepo{}
	ch := &stubClickHouseConn{err: errors.New("mutation failed")}
	svc := &SiteDataService{repo: repo, ch: ch, logger: observability.NewStructuredLogger()}

	if err := svc.DeleteSiteWithData(context.Background(), "site-1"); err == nil {
		t.Fatal("expected error, got nil")
	}

	if len(repo.deleteCalls) != 0 {
		t.Fatalf("expected postgres delete to be skipped, got %#v", repo.deleteCalls)
	}
}

func TestResetSiteDataDeletesAnalyticsBeforeResettingPostgres(t *testing.T) {
	repo := &stubSiteDataRepo{}
	ch := &stubClickHouseConn{}
	svc := &SiteDataService{repo: repo, ch: ch, logger: observability.NewStructuredLogger()}

	if err := svc.ResetSiteData(context.Background(), "site-2"); err != nil {
		t.Fatalf("ResetSiteData() error = %v", err)
	}

	if len(ch.queries) != 1 {
		t.Fatalf("expected 1 clickhouse mutation, got %d", len(ch.queries))
	}
	if len(repo.resetCalls) != 1 || repo.resetCalls[0] != "site-2" {
		t.Fatalf("expected postgres reset for site-2, got %#v", repo.resetCalls)
	}
}
