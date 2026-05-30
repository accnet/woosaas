package bootstrap

import (
	"context"
	"fmt"
	"strings"

	"github.com/accnet/woosaas/api/internal/auth"
	"github.com/accnet/woosaas/api/internal/config"
	"github.com/jackc/pgx/v5/pgxpool"
)

func EnsurePlatformAdmin(ctx context.Context, db *pgxpool.Pool, cfg *config.Config) error {
	email := strings.TrimSpace(strings.ToLower(cfg.PlatformAdminEmail))
	password := cfg.PlatformAdminPassword
	name := strings.TrimSpace(cfg.PlatformAdminName)
	role := strings.TrimSpace(cfg.PlatformAdminRole)

	if email == "" || len(password) < 8 {
		return fmt.Errorf("platform admin email and password (min 8 chars) are required")
	}

	hash, err := auth.HashPassword(password)
	if err != nil {
		return fmt.Errorf("hash platform admin password: %w", err)
	}

	if _, err := db.Exec(ctx, `
		INSERT INTO platform_admin_users (email, password_hash, full_name, role, status)
		VALUES (LOWER($1), $2, $3, $4, 'active')
		ON CONFLICT (email) DO UPDATE SET
			password_hash = EXCLUDED.password_hash,
			full_name = EXCLUDED.full_name,
			role = EXCLUDED.role,
			status = 'active',
			updated_at = NOW()
	`, email, hash, name, role); err != nil {
		return fmt.Errorf("ensure platform admin: %w", err)
	}

	return nil
}
