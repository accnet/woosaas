package export

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/accnet/woosaas/api/pkg/models"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SystemTemplates are seeded for every new site. Keys and column lists must stay stable.
var SystemTemplates = []struct {
	Name        string
	Description string
	Columns     []models.TemplateColumn
	IsDefault   bool
}{
	{
		Name:        "Default",
		Description: "General order information",
		IsDefault:   true,
		Columns: []models.TemplateColumn{
			{Type: "order_field", Key: "order_id", Label: "Order ID"},
			{Type: "order_field", Key: "order_date", Label: "Order Date"},
			{Type: "order_field", Key: "customer_name", Label: "Customer Name"},
			{Type: "order_field", Key: "customer_email", Label: "Customer Email"},
			{Type: "order_field", Key: "customer_phone", Label: "Customer Phone"},
			{Type: "order_field", Key: "payment_status", Label: "Payment Status"},
			{Type: "order_field", Key: "fulfillment_status", Label: "Fulfillment Status"},
			{Type: "order_field", Key: "total_amount", Label: "Total Amount"},
			{Type: "order_field", Key: "currency", Label: "Currency"},
			{Type: "order_field", Key: "item_name", Label: "Item Name"},
			{Type: "order_field", Key: "item_sku", Label: "Item SKU"},
			{Type: "order_field", Key: "item_qty", Label: "Qty"},
			{Type: "order_field", Key: "item_unit_price", Label: "Unit Price"},
			{Type: "order_field", Key: "item_line_total", Label: "Line Total"},
		},
	},
}

type TemplateRepository struct {
	db *pgxpool.Pool
}

func NewTemplateRepository(db *pgxpool.Pool) *TemplateRepository {
	return &TemplateRepository{db: db}
}

// SeedSystemTemplates inserts the built-in shared templates if they do not already exist.
func (r *TemplateRepository) SeedSystemTemplates(ctx context.Context) error {
	for _, tpl := range SystemTemplates {
		colsJSON, err := json.Marshal(tpl.Columns)
		if err != nil {
			return err
		}
		_, err = r.db.Exec(ctx, `
			INSERT INTO export_templates (id, site_id, name, description, columns, is_system, is_default)
			SELECT $1::uuid, NULL, $2::varchar(100), $3::text, $4::jsonb, TRUE,
				CASE
					WHEN $5::boolean = TRUE AND EXISTS (
						SELECT 1 FROM export_templates WHERE site_id IS NULL AND is_default = TRUE
					) THEN FALSE
					ELSE $5::boolean
				END
			WHERE NOT EXISTS (
				SELECT 1 FROM export_templates WHERE site_id IS NULL AND name = $2::varchar(100) AND is_system = TRUE
			)
		`, uuid.New().String(), tpl.Name, tpl.Description, colsJSON, tpl.IsDefault)
		if err != nil {
			return err
		}
	}
	return nil
}

func (r *TemplateRepository) List(ctx context.Context) ([]models.ExportTemplate, error) {
	if err := r.SeedSystemTemplates(ctx); err != nil {
		return nil, err
	}
	rows, err := r.db.Query(ctx, `
		SELECT id, COALESCE(site_id::text, ''), name, description, columns, is_system, is_default, created_at, updated_at
		FROM export_templates
		WHERE site_id IS NULL
		ORDER BY is_system DESC, is_default DESC, created_at ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var templates []models.ExportTemplate
	for rows.Next() {
		tpl, err := scanTemplate(rows)
		if err != nil {
			return nil, err
		}
		templates = append(templates, *tpl)
	}
	if templates == nil {
		templates = []models.ExportTemplate{}
	}
	return templates, nil
}

func (r *TemplateRepository) Get(ctx context.Context, id string) (*models.ExportTemplate, error) {
	row := r.db.QueryRow(ctx, `
		SELECT id, COALESCE(site_id::text, ''), name, description, columns, is_system, is_default, created_at, updated_at
		FROM export_templates
		WHERE site_id IS NULL AND id = $1
	`, id)
	return scanTemplate(row)
}

func (r *TemplateRepository) Create(ctx context.Context, req models.CreateExportTemplateRequest) (*models.ExportTemplate, error) {
	colsJSON, err := json.Marshal(req.Columns)
	if err != nil {
		return nil, err
	}
	id := uuid.New().String()
	_, err = r.db.Exec(ctx, `
		INSERT INTO export_templates (id, site_id, name, description, columns, is_system, is_default)
		VALUES ($1, NULL, $2, $3, $4, FALSE, FALSE)
	`, id, strings.TrimSpace(req.Name), strings.TrimSpace(req.Description), colsJSON)
	if err != nil {
		return nil, err
	}
	return r.Get(ctx, id)
}

func (r *TemplateRepository) Update(ctx context.Context, id string, req models.UpdateExportTemplateRequest) (*models.ExportTemplate, error) {
	colsJSON, err := json.Marshal(req.Columns)
	if err != nil {
		return nil, err
	}
	result, err := r.db.Exec(ctx, `
		UPDATE export_templates
		SET name = $2, description = $3, columns = $4, updated_at = NOW()
		WHERE site_id IS NULL AND id = $1 AND is_system = FALSE
	`, id, strings.TrimSpace(req.Name), strings.TrimSpace(req.Description), colsJSON)
	if err != nil {
		return nil, err
	}
	if result.RowsAffected() == 0 {
		return nil, pgx.ErrNoRows
	}
	return r.Get(ctx, id)
}

func (r *TemplateRepository) Delete(ctx context.Context, id string) error {
	var isSystem, isDefault bool
	err := r.db.QueryRow(ctx,
		`SELECT is_system, is_default FROM export_templates WHERE site_id IS NULL AND id = $1`,
		id,
	).Scan(&isSystem, &isDefault)
	if err != nil {
		return err
	}
	if isSystem {
		return fmt.Errorf("system template cannot be deleted")
	}
	if isDefault {
		return fmt.Errorf("cannot delete the default template; set another template as default first")
	}
	_, err = r.db.Exec(ctx,
		`DELETE FROM export_templates WHERE site_id IS NULL AND id = $1`,
		id,
	)
	return err
}

// SetDefault marks one template as the shared default and clears any previous shared default.
func (r *TemplateRepository) SetDefault(ctx context.Context, id string) (*models.ExportTemplate, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Verify template exists in the shared scope.
	var exists bool
	if err := tx.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM export_templates WHERE site_id IS NULL AND id = $1)`,
		id,
	).Scan(&exists); err != nil || !exists {
		return nil, pgx.ErrNoRows
	}

	// Clear existing default
	if _, err := tx.Exec(ctx,
		`UPDATE export_templates SET is_default = FALSE, updated_at = NOW() WHERE site_id IS NULL AND is_default = TRUE`,
	); err != nil {
		return nil, err
	}

	// Set new default
	if _, err := tx.Exec(ctx,
		`UPDATE export_templates SET is_default = TRUE, updated_at = NOW() WHERE site_id IS NULL AND id = $1`,
		id,
	); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return r.Get(ctx, id)
}

// Duplicate creates a copy of a template (system or user) with " (Copy)" appended to name.
func (r *TemplateRepository) Duplicate(ctx context.Context, id string) (*models.ExportTemplate, error) {
	src, err := r.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	name := src.Name + " (Copy)"
	if len(name) > 100 {
		name = name[:100]
	}
	return r.Create(ctx, models.CreateExportTemplateRequest{
		Name:        name,
		Description: src.Description,
		Columns:     src.Columns,
	})
}

// --- helpers ---

type rowScanner interface {
	Scan(dest ...any) error
}

func scanTemplate(row rowScanner) (*models.ExportTemplate, error) {
	var tpl models.ExportTemplate
	var colsJSON []byte
	var createdAt, updatedAt time.Time
	if err := row.Scan(
		&tpl.ID, &tpl.SiteID, &tpl.Name, &tpl.Description,
		&colsJSON, &tpl.IsSystem, &tpl.IsDefault,
		&createdAt, &updatedAt,
	); err != nil {
		return nil, err
	}
	tpl.CreatedAt = createdAt
	tpl.UpdatedAt = updatedAt
	if err := json.Unmarshal(colsJSON, &tpl.Columns); err != nil {
		tpl.Columns = []models.TemplateColumn{}
	}
	return &tpl, nil
}
