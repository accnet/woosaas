package main

import (
	"context"
	"flag"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/woosaas/api/internal/config"
	"github.com/woosaas/api/internal/database"
)

func main() {
	// Parse flags
	up := flag.Bool("up", false, "Run migrations")
	down := flag.Bool("down", false, "Rollback migrations")
	reset := flag.Bool("reset", false, "Reset database")
	flag.Parse()

	if !*up && !*down && !*reset {
		log.Fatal("Usage: go run cmd/migrate/main.go -up | -down | -reset")
	}

	// Load config
	cfg := config.Load()

	// Connect to databases
	pg, err := database.NewPostgresDB(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to PostgreSQL: %v", err)
	}
	defer pg.Close()

	ch, err := database.NewClickHouseDB(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to ClickHouse: %v", err)
	}
	defer ch.Close()

	if *reset {
		log.Println("Resetting PostgreSQL...")
		if err := runPostgresMigrations(pg, true); err != nil {
			log.Fatalf("Failed to reset PostgreSQL: %v", err)
		}
		log.Println("Resetting ClickHouse...")
		if err := runClickHouseMigrations(ch, true); err != nil {
			log.Fatalf("Failed to reset ClickHouse: %v", err)
		}
		log.Println("Reset complete!")
		return
	}

	if *up {
		log.Println("Running PostgreSQL migrations...")
		if err := runPostgresMigrations(pg, false); err != nil {
			log.Fatalf("Failed to run PostgreSQL migrations: %v", err)
		}

		log.Println("Running ClickHouse migrations...")
		if err := runClickHouseMigrations(ch, false); err != nil {
			log.Fatalf("Failed to run ClickHouse migrations: %v", err)
		}
		log.Println("Migrations complete!")
	}

	if *down {
		log.Println("Rolling back PostgreSQL migrations...")
		if err := rollbackPostgresMigrations(pg); err != nil {
			log.Fatalf("Failed to rollback PostgreSQL migrations: %v", err)
		}
		log.Println("Rollback complete!")
	}
}

func runPostgresMigrations(db *pgxpool.Pool, reset bool) error {
	sql, err := readFirstExisting(
		"migrations_postgres/001_init.sql",
		"../migrations_postgres/001_init.sql",
		"api/migrations_postgres/001_init.sql",
	)
	if err != nil {
		log.Printf("Could not find init.sql: %v", err)
		return err
	}

	_, err = db.Exec(context.Background(), string(sql))
	return err
}

func runClickHouseMigrations(db driver.Conn, reset bool) error {
	sql, err := readFirstExisting(
		"migrations/clickhouse/001_create_events.sql",
		"../migrations/clickhouse/001_create_events.sql",
		"api/migrations/clickhouse/001_create_events.sql",
	)
	if err != nil {
		log.Printf("Could not find 001_create_events.sql: %v", err)
		return err
	}

	for _, statement := range splitSQLStatements(string(sql)) {
		if err := db.Exec(context.Background(), statement); err != nil {
			return err
		}
	}
	return nil
}

func rollbackPostgresMigrations(db *pgxpool.Pool) error {
	// Implementation for rollback would go here
	return nil
}

func readFirstExisting(paths ...string) ([]byte, error) {
	var lastErr error
	for _, path := range paths {
		data, err := os.ReadFile(filepath.Clean(path))
		if err == nil {
			return data, nil
		}
		lastErr = err
	}
	return nil, lastErr
}

func splitSQLStatements(sql string) []string {
	lines := strings.Split(sql, "\n")
	withoutComments := make([]string, 0, len(lines))
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "--") {
			continue
		}
		withoutComments = append(withoutComments, line)
	}

	parts := strings.Split(strings.Join(withoutComments, "\n"), ";")
	statements := make([]string, 0, len(parts))
	for _, part := range parts {
		statement := strings.TrimSpace(part)
		if statement != "" {
			statements = append(statements, statement)
		}
	}
	return statements
}
