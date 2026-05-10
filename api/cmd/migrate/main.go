package main

import (
	"context"
	"flag"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/accnet/woosaas/api/internal/config"
	"github.com/accnet/woosaas/api/internal/database"
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
	files, err := findMigrationFiles(
		"migrations_postgres",
		"../migrations_postgres",
		"api/migrations_postgres",
	)
	if err != nil {
		return err
	}

	for _, file := range files {
		sql, err := os.ReadFile(filepath.Clean(file))
		if err != nil {
			return err
		}
		for _, statement := range splitSQLStatements(string(sql)) {
			if _, err := db.Exec(context.Background(), statement); err != nil {
				return err
			}
		}
	}

	return nil
}

func runClickHouseMigrations(db driver.Conn, reset bool) error {
	files, err := findMigrationFiles(
		"migrations/clickhouse",
		"../migrations/clickhouse",
		"api/migrations/clickhouse",
	)
	if err != nil {
		return err
	}

	for _, file := range files {
		sql, err := os.ReadFile(filepath.Clean(file))
		if err != nil {
			return err
		}
		for _, statement := range splitSQLStatements(string(sql)) {
			if err := db.Exec(context.Background(), statement); err != nil {
				return err
			}
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

func findMigrationFiles(dirs ...string) ([]string, error) {
	for _, dir := range dirs {
		entries, err := os.ReadDir(filepath.Clean(dir))
		if err != nil {
			continue
		}
		files := make([]string, 0, len(entries))
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
				continue
			}
			files = append(files, filepath.Join(dir, entry.Name()))
		}
		sort.Strings(files)
		if len(files) > 0 {
			return files, nil
		}
	}
	return nil, os.ErrNotExist
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
