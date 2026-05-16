package handlers

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/accnet/woosaas/api/internal/export"
	"github.com/accnet/woosaas/api/internal/orders"
	"github.com/accnet/woosaas/api/pkg/models"
	"github.com/gin-gonic/gin"
)

// ExportOrdersCSV streams a CSV file for selected or filtered orders.
//
// Query params:
//
//	site_id         string   required
//	template_id     string   optional — defaults to the site's default template
//	ids             string   optional — comma-separated woo_order_id list (selected rows)
//	q               string   optional — search query
//	payment_status  string   optional
//	fulfillment_status string optional
//	date_from       string   optional
//	date_to         string   optional
func (h *OrdersHandler) ExportOrdersCSV(c *gin.Context) {
	siteID := c.Query("site_id")
	if siteID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "site_id is required"})
		return
	}
	if !h.requireSiteAccess(c, siteID) {
		return
	}

	// --- Resolve template ---
	templateID := c.Query("template_id")
	tpl, err := h.resolveExportTemplate(c, siteID, templateID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(tpl) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "template has no columns"})
		return
	}

	// --- Build filter params ---
	params := orders.ExportOrdersParams{
		ListOrdersParams: orders.ListOrdersParams{
			SiteID:            siteID,
			Query:             c.Query("q"),
			PaymentStatus:     c.Query("payment_status"),
			FulfillmentStatus: c.Query("fulfillment_status"),
			Status:            c.Query("status"),
		},
	}

	// Parse date filters
	if dateFrom := c.Query("date_from"); dateFrom != "" {
		parsed, err := parseDateTime(dateFrom)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date_from"})
			return
		}
		params.DateFrom = &parsed
	}
	if dateTo := c.Query("date_to"); dateTo != "" {
		parsed, err := parseDateTime(dateTo)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date_to"})
			return
		}
		params.DateTo = &parsed
	}

	// Selected order IDs (comma-separated)
	if idsParam := c.Query("ids"); idsParam != "" {
		for _, id := range strings.Split(idsParam, ",") {
			if trimmed := strings.TrimSpace(id); trimmed != "" {
				params.OrderIDs = append(params.OrderIDs, trimmed)
			}
		}
	}

	// --- Set response headers ---
	filename := fmt.Sprintf("orders-%s.csv", time.Now().UTC().Format("2006-01-02"))
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", "attachment; filename=\""+filename+"\"")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Status(http.StatusOK)

	// --- Stream CSV ---
	w := csv.NewWriter(c.Writer)

	// Header row
	if err := w.Write(export.HeaderRow(tpl)); err != nil {
		return
	}
	w.Flush()

	// Page through orders in batches of 500
	batchSize := 500
	totalWritten := 0
	for page := 1; ; page++ {
		params.Page = page
		params.PageSize = batchSize

		batch, _, err := h.svc.FetchOrdersForExport(c.Request.Context(), params)
		if err != nil || len(batch) == 0 {
			break
		}

		for _, order := range batch {
			rows := export.BuildRows(order, tpl)
			for _, row := range rows {
				if err := w.Write(row); err != nil {
					return
				}
				totalWritten++
			}
		}
		w.Flush()

		if len(batch) < batchSize {
			break // last page
		}
	}

	_ = totalWritten
}

// resolveExportTemplate returns the template by ID or falls back to the shared default.
func (h *OrdersHandler) resolveExportTemplate(c *gin.Context, siteID, templateID string) ([]models.TemplateColumn, error) {
	if h.templateRepo == nil {
		return nil, fmt.Errorf("export templates not configured")
	}
	if templateID != "" {
		tpl, err := h.templateRepo.Get(c.Request.Context(), templateID)
		if err != nil {
			return nil, fmt.Errorf("template not found")
		}
		return tpl.Columns, nil
	}
	_ = siteID
	// Use shared default
	templates, err := h.templateRepo.List(c.Request.Context())
	if err != nil || len(templates) == 0 {
		return nil, fmt.Errorf("no export templates found; create one in Settings → Export Templates")
	}
	for _, t := range templates {
		if t.IsDefault {
			return t.Columns, nil
		}
	}
	return templates[0].Columns, nil
}
