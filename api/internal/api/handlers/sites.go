package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/woosaas/api/internal/sites"
	"github.com/woosaas/api/pkg/models"
)

type SitesHandler struct {
	repo *sites.Repository
}

func NewSitesHandler(repo *sites.Repository) *SitesHandler {
	return &SitesHandler{repo: repo}
}

// CreateSite creates a new site
func (h *SitesHandler) CreateSite(c *gin.Context) {
	userID := c.GetString("user_id")

	var req models.CreateSiteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Set defaults
	timezone := req.Timezone
	if timezone == "" {
		timezone = "UTC"
	}
	currency := req.Currency
	if currency == "" {
		currency = "USD"
	}

	// Normalize domain
	domain := sites.ExtractDomain(req.Domain)

	site, err := h.repo.CreateSite(c.Request.Context(), userID, req.Name, domain, timezone, currency)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create site"})
		return
	}

	c.JSON(http.StatusCreated, site)
}

// GetSites returns all sites for the current user
func (h *SitesHandler) GetSites(c *gin.Context) {
	userID := c.GetString("user_id")

	sites, err := h.repo.GetSitesByUserID(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get sites"})
		return
	}

	if sites == nil {
		sites = []models.Site{}
	}

	c.JSON(http.StatusOK, sites)
}

// GetSite returns a specific site
func (h *SitesHandler) GetSite(c *gin.Context) {
	userID := c.GetString("user_id")
	siteID := c.Param("site_id")

	// Check access
	hasAccess, err := h.repo.UserHasAccessToSite(c.Request.Context(), userID, siteID)
	if err != nil || !hasAccess {
		c.JSON(http.StatusNotFound, gin.H{"error": "Site not found"})
		return
	}

	site, err := h.repo.GetSiteByID(c.Request.Context(), siteID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Site not found"})
		return
	}

	c.JSON(http.StatusOK, site)
}

// UpdateSite updates a site
func (h *SitesHandler) UpdateSite(c *gin.Context) {
	userID := c.GetString("user_id")
	siteID := c.Param("site_id")

	// Check access
	hasAccess, err := h.repo.UserHasAccessToSite(c.Request.Context(), userID, siteID)
	if err != nil || !hasAccess {
		c.JSON(http.StatusNotFound, gin.H{"error": "Site not found"})
		return
	}

	var req models.UpdateSiteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.repo.UpdateSite(c.Request.Context(), siteID, req.Name, req.Timezone, req.Currency); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update site"})
		return
	}

	site, _ := h.repo.GetSiteByID(c.Request.Context(), siteID)
	c.JSON(http.StatusOK, site)
}

// DeleteSite deletes a site
func (h *SitesHandler) DeleteSite(c *gin.Context) {
	userID := c.GetString("user_id")
	siteID := c.Param("site_id")

	// Check access
	hasAccess, err := h.repo.UserHasAccessToSite(c.Request.Context(), userID, siteID)
	if err != nil || !hasAccess {
		c.JSON(http.StatusNotFound, gin.H{"error": "Site not found"})
		return
	}

	if err := h.repo.DeleteSite(c.Request.Context(), siteID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete site"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Site deleted"})
}

// CreateAPIKey creates a new API key for a site
func (h *SitesHandler) CreateAPIKey(c *gin.Context) {
	userID := c.GetString("user_id")
	siteID := c.Param("site_id")

	// Check access
	hasAccess, err := h.repo.UserHasAccessToSite(c.Request.Context(), userID, siteID)
	if err != nil || !hasAccess {
		c.JSON(http.StatusNotFound, gin.H{"error": "Site not found"})
		return
	}

	var req models.CreateAPIKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	apiKey, err := h.repo.CreateAPIKey(c.Request.Context(), siteID, req.Name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create API key"})
		return
	}

	c.JSON(http.StatusCreated, apiKey)
}

// GetAPIKeys returns all API keys for a site
func (h *SitesHandler) GetAPIKeys(c *gin.Context) {
	userID := c.GetString("user_id")
	siteID := c.Param("site_id")

	// Check access
	hasAccess, err := h.repo.UserHasAccessToSite(c.Request.Context(), userID, siteID)
	if err != nil || !hasAccess {
		c.JSON(http.StatusNotFound, gin.H{"error": "Site not found"})
		return
	}

	keys, err := h.repo.GetAPIKeysBySiteID(c.Request.Context(), siteID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get API keys"})
		return
	}

	if keys == nil {
		keys = []models.APIKey{}
	}

	c.JSON(http.StatusOK, keys)
}

// GetTrackingCode returns tracking code for a site
func (h *SitesHandler) GetTrackingCode(c *gin.Context) {
	userID := c.GetString("user_id")
	siteID := c.Param("site_id")

	// Check access
	hasAccess, err := h.repo.UserHasAccessToSite(c.Request.Context(), userID, siteID)
	if err != nil || !hasAccess {
		c.JSON(http.StatusNotFound, gin.H{"error": "Site not found"})
		return
	}

	site, err := h.repo.GetSiteByID(c.Request.Context(), siteID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Site not found"})
		return
	}

	keys, _ := h.repo.GetAPIKeysBySiteID(c.Request.Context(), siteID)
	apiKeyHint := ""
	if len(keys) > 0 {
		apiKeyHint = keys[0].KeyPrefix + "..."
	}

	trackingCode := gin.H{
		"site":     site,
		"api_keys": keys,
		"instructions": gin.H{
			"method":     "WordPress Plugin",
			"plugin_url": "https://github.com/woosaas/plugin",
			"config": gin.H{
				"api_key": apiKeyHint,
				"domain":  site.Domain,
			},
		},
	}

	c.JSON(http.StatusOK, trackingCode)
}
