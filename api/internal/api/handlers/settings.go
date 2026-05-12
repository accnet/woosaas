package handlers

import (
	"net/http"
	"strings"

	"github.com/accnet/woosaas/api/internal/settings"
	"github.com/accnet/woosaas/api/pkg/models"
	"github.com/gin-gonic/gin"
)

type SettingsHandler struct {
	repo *settings.Repository
}

func NewSettingsHandler(repo *settings.Repository) *SettingsHandler {
	return &SettingsHandler{repo: repo}
}

func (h *SettingsHandler) GetUserSettings(c *gin.Context) {
	userID := c.GetString("user_id")
	settings, err := h.repo.GetUserSettings(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get settings"})
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *SettingsHandler) UpdateUserSettings(c *gin.Context) {
	userID := c.GetString("user_id")
	var req models.UpdateUserSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req.Timezone = strings.TrimSpace(req.Timezone)
	req.Currency = strings.ToUpper(strings.TrimSpace(req.Currency))
	req.DefaultDateRange = strings.TrimSpace(req.DefaultDateRange)
	req.DashboardDensity = strings.TrimSpace(req.DashboardDensity)
	req.LandingPage = strings.TrimSpace(req.LandingPage)

	if req.Currency != "" && len(req.Currency) != 3 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "currency must be a 3-letter ISO code"})
		return
	}
	if req.DefaultDateRange != "" && !oneOf(req.DefaultDateRange, "24h", "7d", "30d", "90d") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid default_date_range"})
		return
	}
	if req.DashboardDensity != "" && !oneOf(req.DashboardDensity, "comfortable", "compact") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid dashboard_density"})
		return
	}
	if req.LandingPage != "" && !oneOf(req.LandingPage, "sites", "dashboard") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid landing_page"})
		return
	}

	settings, err := h.repo.UpsertUserSettings(c.Request.Context(), userID, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update settings"})
		return
	}
	c.JSON(http.StatusOK, settings)
}

func (h *SettingsHandler) GetBillingProfile(c *gin.Context) {
	userID := c.GetString("user_id")
	profile, err := h.repo.GetBillingProfile(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get billing profile"})
		return
	}
	c.JSON(http.StatusOK, profile)
}

func (h *SettingsHandler) UpdateBillingProfile(c *gin.Context) {
	userID := c.GetString("user_id")
	var req models.BillingProfile
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	profile, err := h.repo.UpsertBillingProfile(c.Request.Context(), userID, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update billing profile"})
		return
	}
	c.JSON(http.StatusOK, profile)
}

func (h *SettingsHandler) ListInvoices(c *gin.Context) {
	userID := c.GetString("user_id")
	invoices, err := h.repo.ListInvoices(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get invoices"})
		return
	}
	c.JSON(http.StatusOK, invoices)
}

func oneOf(value string, candidates ...string) bool {
	for _, candidate := range candidates {
		if value == candidate {
			return true
		}
	}
	return false
}
