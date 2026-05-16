package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/accnet/woosaas/api/internal/export"
	"github.com/accnet/woosaas/api/pkg/models"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

type ExportTemplatesHandler struct {
	repo *export.TemplateRepository
}

func NewExportTemplatesHandler(repo *export.TemplateRepository) *ExportTemplatesHandler {
	return &ExportTemplatesHandler{repo: repo}
}

// GET /api/v1/export-templates
func (h *ExportTemplatesHandler) List(c *gin.Context) {
	templates, err := h.repo.List(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list templates"})
		return
	}
	c.JSON(http.StatusOK, templates)
}

// GET /api/v1/export-templates/:id
func (h *ExportTemplatesHandler) Get(c *gin.Context) {
	id := c.Param("id")
	tpl, err := h.repo.Get(c.Request.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Template not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get template"})
		return
	}
	c.JSON(http.StatusOK, tpl)
}

// POST /api/v1/export-templates
func (h *ExportTemplatesHandler) Create(c *gin.Context) {
	var req models.CreateExportTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := validateTemplateRequest(req.Name, req.Columns); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	tpl, err := h.repo.Create(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create template"})
		return
	}
	c.JSON(http.StatusCreated, tpl)
}

// PUT /api/v1/export-templates/:id
func (h *ExportTemplatesHandler) Update(c *gin.Context) {
	id := c.Param("id")
	var req models.UpdateExportTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := validateTemplateRequest(req.Name, req.Columns); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	tpl, err := h.repo.Update(c.Request.Context(), id, req)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Template not found or is a system template"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update template"})
		return
	}
	c.JSON(http.StatusOK, tpl)
}

// DELETE /api/v1/export-templates/:id
func (h *ExportTemplatesHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	err := h.repo.Delete(c.Request.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Template not found"})
		return
	}
	if err != nil {
		msg := err.Error()
		if strings.Contains(msg, "system template") || strings.Contains(msg, "default template") {
			c.JSON(http.StatusForbidden, gin.H{"error": msg})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete template"})
		return
	}
	c.JSON(http.StatusNoContent, nil)
}

// POST /api/v1/export-templates/:id/set-default
func (h *ExportTemplatesHandler) SetDefault(c *gin.Context) {
	id := c.Param("id")
	tpl, err := h.repo.SetDefault(c.Request.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Template not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to set default"})
		return
	}
	c.JSON(http.StatusOK, tpl)
}

// POST /api/v1/export-templates/:id/duplicate
func (h *ExportTemplatesHandler) Duplicate(c *gin.Context) {
	id := c.Param("id")
	tpl, err := h.repo.Duplicate(c.Request.Context(), id)
	if errors.Is(err, pgx.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Template not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to duplicate template"})
		return
	}
	c.JSON(http.StatusCreated, tpl)
}

// GET /api/v1/export/columns — return the column registry for the frontend UI
func (h *ExportTemplatesHandler) ListColumns(c *gin.Context) {
	type columnItem struct {
		Key   string `json:"key"`
		Label string `json:"label"`
		Group string `json:"group"`
	}
	type groupItem struct {
		Group   string       `json:"group"`
		Columns []columnItem `json:"columns"`
	}

	grouped := make(map[string]*groupItem)
	for _, g := range export.GroupOrder {
		grouped[g] = &groupItem{Group: g}
	}
	for key, def := range export.ColumnRegistry {
		if g, ok := grouped[def.Group]; ok {
			g.Columns = append(g.Columns, columnItem{Key: key, Label: def.Label, Group: def.Group})
		}
	}

	result := make([]groupItem, 0, len(export.GroupOrder))
	for _, g := range export.GroupOrder {
		if grp, ok := grouped[g]; ok && len(grp.Columns) > 0 {
			result = append(result, *grp)
		}
	}
	c.JSON(http.StatusOK, result)
}

// --- validation ---

func validateTemplateRequest(name string, cols []models.TemplateColumn) error {
	if strings.TrimSpace(name) == "" {
		return errors.New("name is required")
	}
	if len(cols) == 0 {
		return errors.New("columns must not be empty")
	}
	hasOrderField := false
	for i, col := range cols {
		if col.Type != models.TemplateColumnOrderField && col.Type != models.TemplateColumnCustom {
			return fmt.Errorf("column[%d]: type must be 'order_field' or 'custom'", i)
		}
		if strings.TrimSpace(col.Label) == "" {
			return fmt.Errorf("column[%d]: label is required", i)
		}
		if col.Type == models.TemplateColumnOrderField {
			if !export.IsValidKey(col.Key) {
				return fmt.Errorf("column[%d]: invalid key %q", i, col.Key)
			}
			hasOrderField = true
		}
	}
	if !hasOrderField {
		return errors.New("at least one order_field column is required")
	}
	return nil
}
