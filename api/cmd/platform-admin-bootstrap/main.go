package main

import (
	"context"
	"flag"
	"log"
	"strings"

	"github.com/accnet/woosaas/api/internal/auth"
	"github.com/accnet/woosaas/api/internal/config"
	"github.com/accnet/woosaas/api/internal/database"
)

func main() {
	email := flag.String("email", "", "platform admin email")
	password := flag.String("password", "", "platform admin password")
	name := flag.String("name", "", "platform admin full name")
	role := flag.String("role", "owner", "platform admin role")
	flag.Parse()

	if strings.TrimSpace(*email) == "" || len(*password) < 8 {
		log.Fatal("email and password (min 8 chars) are required")
	}

	cfg := config.Load()
	db, err := database.NewPostgresDB(cfg)
	if err != nil {
		log.Fatalf("connect postgres: %v", err)
	}
	defer db.Close()

	hash, err := auth.HashPassword(*password)
	if err != nil {
		log.Fatalf("hash password: %v", err)
	}

	_, err = db.Exec(context.Background(), `
		INSERT INTO platform_admin_users (email, password_hash, full_name, role, status)
		VALUES (LOWER($1), $2, $3, $4, 'active')
		ON CONFLICT (email) DO UPDATE SET
			password_hash = EXCLUDED.password_hash,
			full_name = EXCLUDED.full_name,
			role = EXCLUDED.role,
			status = 'active',
			updated_at = NOW()
	`, strings.TrimSpace(*email), hash, strings.TrimSpace(*name), strings.TrimSpace(*role))
	if err != nil {
		log.Fatalf("bootstrap platform admin: %v", err)
	}
	log.Printf("platform admin ready: %s", strings.ToLower(strings.TrimSpace(*email)))
}
