package tracking_providers

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Provider struct {
	ID               string `json:"id"`
	DisplayName      string `json:"display_name"`
	Enabled          bool   `json:"enabled"`
	BaseURL          string `json:"base_url"`
	DocsURL          string `json:"docs_url"`
	AuthType         string `json:"auth_type"`
	SupportsWebhooks bool   `json:"supports_webhooks"`
	SupportsRefresh  bool   `json:"supports_refresh"`
	SupportsRegister bool   `json:"supports_register"`
	Capabilities     []byte `json:"capabilities"`
	ConfigSchema     []byte `json:"config_schema"`
}

type Service struct {
	db *pgxpool.Pool
}

func NewService(db *pgxpool.Pool) *Service {
	return &Service{db: db}
}

func (s *Service) ListProviders(ctx context.Context, includeDisabled bool) ([]Provider, error) {
	query := `
		SELECT id, display_name, enabled, COALESCE(base_url, ''), COALESCE(docs_url, ''), auth_type,
		       supports_webhooks, supports_refresh, supports_register, capabilities, config_schema
		FROM tracking_providers
	`
	if !includeDisabled {
		query += ` WHERE enabled = true`
	}
	query += ` ORDER BY display_name ASC`

	rows, err := s.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var providers []Provider
	for rows.Next() {
		var p Provider
		if err := rows.Scan(
			&p.ID, &p.DisplayName, &p.Enabled, &p.BaseURL, &p.DocsURL, &p.AuthType,
			&p.SupportsWebhooks, &p.SupportsRefresh, &p.SupportsRegister, &p.Capabilities, &p.ConfigSchema,
		); err != nil {
			return nil, err
		}
		providers = append(providers, p)
	}
	return providers, rows.Err()
}

func (s *Service) GetProvider(ctx context.Context, providerID string) (*Provider, error) {
	var p Provider
	err := s.db.QueryRow(ctx, `
		SELECT id, display_name, enabled, COALESCE(base_url, ''), COALESCE(docs_url, ''), auth_type,
		       supports_webhooks, supports_refresh, supports_register, capabilities, config_schema
		FROM tracking_providers
		WHERE id = $1
	`, providerID).Scan(
		&p.ID, &p.DisplayName, &p.Enabled, &p.BaseURL, &p.DocsURL, &p.AuthType,
		&p.SupportsWebhooks, &p.SupportsRefresh, &p.SupportsRegister, &p.Capabilities, &p.ConfigSchema,
	)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *Service) IsProviderEnabled(ctx context.Context, providerID string) (bool, error) {
	var enabled bool
	err := s.db.QueryRow(ctx, `SELECT enabled FROM tracking_providers WHERE id = $1`, providerID).Scan(&enabled)
	if err == pgx.ErrNoRows {
		return false, nil
	}
	return enabled, err
}

func (s *Service) UpdateProviderEnabled(ctx context.Context, providerID string, enabled bool) error {
	_, err := s.db.Exec(ctx, `
		UPDATE tracking_providers
		SET enabled = $2, updated_at = NOW()
		WHERE id = $1
	`, providerID, enabled)
	return err
}
