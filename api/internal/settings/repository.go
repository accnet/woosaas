package settings

import (
	"context"
	"errors"

	"github.com/accnet/woosaas/api/pkg/models"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Repository struct {
	db *pgxpool.Pool
}

func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

func DefaultUserSettings(userID string) *models.UserSettings {
	return &models.UserSettings{
		UserID:           userID,
		Timezone:         "UTC",
		Currency:         "USD",
		DefaultDateRange: "7d",
		DashboardDensity: "comfortable",
		LandingPage:      "sites",
	}
}

func (r *Repository) GetUserSettings(ctx context.Context, userID string) (*models.UserSettings, error) {
	var settings models.UserSettings
	err := r.db.QueryRow(ctx, `
		SELECT user_id, timezone, currency, default_date_range, dashboard_density, landing_page, created_at, updated_at
		FROM user_settings
		WHERE user_id = $1
	`, userID).Scan(
		&settings.UserID,
		&settings.Timezone,
		&settings.Currency,
		&settings.DefaultDateRange,
		&settings.DashboardDensity,
		&settings.LandingPage,
		&settings.CreatedAt,
		&settings.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return DefaultUserSettings(userID), nil
	}
	if err != nil {
		return nil, err
	}
	return &settings, nil
}

func (r *Repository) UpsertUserSettings(ctx context.Context, userID string, input models.UpdateUserSettingsRequest) (*models.UserSettings, error) {
	current, err := r.GetUserSettings(ctx, userID)
	if err != nil {
		return nil, err
	}

	if input.Timezone != "" {
		current.Timezone = input.Timezone
	}
	if input.Currency != "" {
		current.Currency = input.Currency
	}
	if input.DefaultDateRange != "" {
		current.DefaultDateRange = input.DefaultDateRange
	}
	if input.DashboardDensity != "" {
		current.DashboardDensity = input.DashboardDensity
	}
	if input.LandingPage != "" {
		current.LandingPage = input.LandingPage
	}

	var saved models.UserSettings
	err = r.db.QueryRow(ctx, `
		INSERT INTO user_settings (user_id, timezone, currency, default_date_range, dashboard_density, landing_page)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (user_id) DO UPDATE SET
			timezone = EXCLUDED.timezone,
			currency = EXCLUDED.currency,
			default_date_range = EXCLUDED.default_date_range,
			dashboard_density = EXCLUDED.dashboard_density,
			landing_page = EXCLUDED.landing_page,
			updated_at = NOW()
		RETURNING user_id, timezone, currency, default_date_range, dashboard_density, landing_page, created_at, updated_at
	`, userID, current.Timezone, current.Currency, current.DefaultDateRange, current.DashboardDensity, current.LandingPage).Scan(
		&saved.UserID,
		&saved.Timezone,
		&saved.Currency,
		&saved.DefaultDateRange,
		&saved.DashboardDensity,
		&saved.LandingPage,
		&saved.CreatedAt,
		&saved.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &saved, nil
}

func DefaultBillingProfile() *models.BillingProfile {
	return &models.BillingProfile{}
}

func (r *Repository) GetBillingProfile(ctx context.Context, userID string) (*models.BillingProfile, error) {
	var profile models.BillingProfile
	err := r.db.QueryRow(ctx, `
		SELECT billing_name, company, email, phone, tax_id, address_line1, address_line2,
			city, state, postal_code, country, created_at, updated_at
		FROM billing_profiles
		WHERE user_id = $1
	`, userID).Scan(
		&profile.BillingName,
		&profile.Company,
		&profile.Email,
		&profile.Phone,
		&profile.TaxID,
		&profile.AddressLine1,
		&profile.AddressLine2,
		&profile.City,
		&profile.State,
		&profile.PostalCode,
		&profile.Country,
		&profile.CreatedAt,
		&profile.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return DefaultBillingProfile(), nil
	}
	if err != nil {
		return nil, err
	}
	return &profile, nil
}

func (r *Repository) UpsertBillingProfile(ctx context.Context, userID string, input models.BillingProfile) (*models.BillingProfile, error) {
	var saved models.BillingProfile
	err := r.db.QueryRow(ctx, `
		INSERT INTO billing_profiles (
			user_id, billing_name, company, email, phone, tax_id, address_line1, address_line2,
			city, state, postal_code, country
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		ON CONFLICT (user_id) DO UPDATE SET
			billing_name = EXCLUDED.billing_name,
			company = EXCLUDED.company,
			email = EXCLUDED.email,
			phone = EXCLUDED.phone,
			tax_id = EXCLUDED.tax_id,
			address_line1 = EXCLUDED.address_line1,
			address_line2 = EXCLUDED.address_line2,
			city = EXCLUDED.city,
			state = EXCLUDED.state,
			postal_code = EXCLUDED.postal_code,
			country = EXCLUDED.country,
			updated_at = NOW()
		RETURNING billing_name, company, email, phone, tax_id, address_line1, address_line2,
			city, state, postal_code, country, created_at, updated_at
	`, userID, input.BillingName, input.Company, input.Email, input.Phone, input.TaxID, input.AddressLine1, input.AddressLine2,
		input.City, input.State, input.PostalCode, input.Country).Scan(
		&saved.BillingName,
		&saved.Company,
		&saved.Email,
		&saved.Phone,
		&saved.TaxID,
		&saved.AddressLine1,
		&saved.AddressLine2,
		&saved.City,
		&saved.State,
		&saved.PostalCode,
		&saved.Country,
		&saved.CreatedAt,
		&saved.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &saved, nil
}

func (r *Repository) ListInvoices(ctx context.Context, userID string) ([]models.Invoice, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, invoice_number, status, amount_cents, currency, issued_at, due_at, paid_at,
			hosted_url, pdf_url, created_at
		FROM invoices
		WHERE user_id = $1
		ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	invoices := []models.Invoice{}
	for rows.Next() {
		var invoice models.Invoice
		if err := rows.Scan(
			&invoice.ID,
			&invoice.InvoiceNumber,
			&invoice.Status,
			&invoice.AmountCents,
			&invoice.Currency,
			&invoice.IssuedAt,
			&invoice.DueAt,
			&invoice.PaidAt,
			&invoice.HostedURL,
			&invoice.PDFURL,
			&invoice.CreatedAt,
		); err != nil {
			return nil, err
		}
		invoices = append(invoices, invoice)
	}
	return invoices, rows.Err()
}
