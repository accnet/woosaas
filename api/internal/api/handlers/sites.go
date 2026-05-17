package handlers

import (
	"net/http"
	"time"

	"github.com/accnet/woosaas/api/internal/export"
	"github.com/accnet/woosaas/api/internal/ingest"
	"github.com/accnet/woosaas/api/internal/sites"
	"github.com/accnet/woosaas/api/internal/teams"
	"github.com/accnet/woosaas/api/pkg/models"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type SitesHandler struct {
	repo         sites.SiteRepository
	collector    *ingest.Collector
	templateRepo *export.TemplateRepository
	siteData     *sites.SiteDataService
}

func NewSitesHandler(repo sites.SiteRepository, collector *ingest.Collector, templateRepo *export.TemplateRepository, siteData *sites.SiteDataService) *SitesHandler {
	return &SitesHandler{repo: repo, collector: collector, templateRepo: templateRepo, siteData: siteData}
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

	// Ensure shared export templates exist (best-effort, non-blocking)
	if h.templateRepo != nil {
		_ = h.templateRepo.SeedSystemTemplates(c.Request.Context())
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

	if !h.requireSitePermission(c, userID, siteID, "site:read") {
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

	if !h.requireSitePermission(c, userID, siteID, "site:write") {
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

	if !h.requireSitePermission(c, userID, siteID, "site:delete") {
		c.JSON(http.StatusNotFound, gin.H{"error": "Site not found"})
		return
	}

	if err := h.siteData.DeleteSiteWithData(c.Request.Context(), siteID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete site"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Site deleted"})
}

// ResetSiteData clears analytics and commerce data for a site but keeps the site and integration config.
func (h *SitesHandler) ResetSiteData(c *gin.Context) {
	userID := c.GetString("user_id")
	siteID := c.Param("site_id")

	if !h.requireSitePermission(c, userID, siteID, "site:delete") {
		c.JSON(http.StatusNotFound, gin.H{"error": "Site not found"})
		return
	}

	if err := h.siteData.ResetSiteData(c.Request.Context(), siteID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to reset site data"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Site data reset"})
}

// CreateAPIKey creates a new API key for a site
func (h *SitesHandler) CreateAPIKey(c *gin.Context) {
	userID := c.GetString("user_id")
	siteID := c.Param("site_id")

	if !h.requireSitePermission(c, userID, siteID, "api_keys:write") {
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

// DeleteAPIKey revokes and removes an API key
func (h *SitesHandler) DeleteAPIKey(c *gin.Context) {
	userID := c.GetString("user_id")
	siteID := c.Param("site_id")
	keyID := c.Param("key_id")

	if !h.requireSitePermission(c, userID, siteID, "api_keys:write") {
		c.JSON(http.StatusNotFound, gin.H{"error": "Site not found"})
		return
	}

	if err := h.repo.RevokeAPIKey(c.Request.Context(), keyID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete API key"})
		return
	}

	c.Status(http.StatusNoContent)
}

// GetAPIKeys returns all API keys for a site
func (h *SitesHandler) GetAPIKeys(c *gin.Context) {
	userID := c.GetString("user_id")
	siteID := c.Param("site_id")

	if !h.requireSitePermission(c, userID, siteID, "api_keys:read") {
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

	if !h.requireSitePermission(c, userID, siteID, "site:read") {
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
	verification, _ := h.repo.GetTrackingVerification(c.Request.Context(), siteID)

	trackingCode := gin.H{
		"site":         site,
		"api_keys":     keys,
		"verification": verification,
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

func (h *SitesHandler) GetSiteMembers(c *gin.Context) {
	userID := c.GetString("user_id")
	siteID := c.Param("site_id")

	if !h.requireSitePermission(c, userID, siteID, "users:read") {
		c.JSON(http.StatusNotFound, gin.H{"error": "Site not found"})
		return
	}

	members, err := h.repo.GetSiteMembers(c.Request.Context(), siteID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get site members"})
		return
	}

	role, err := h.repo.GetUserSiteRole(c.Request.Context(), userID, siteID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to resolve site role"})
		return
	}

	c.JSON(http.StatusOK, models.SiteMembersResponse{
		Members:                members,
		CurrentUserRole:        role,
		CurrentUserPermissions: teams.PermissionsForRole(role),
	})
}

func (h *SitesHandler) AddSiteMember(c *gin.Context) {
	userID := c.GetString("user_id")
	siteID := c.Param("site_id")

	if !h.requireSitePermission(c, userID, siteID, "users:write") {
		c.JSON(http.StatusNotFound, gin.H{"error": "Site not found"})
		return
	}

	var req models.CreateSiteMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	member, err := h.repo.AddSiteMemberByEmail(c.Request.Context(), siteID, req.Email, req.Role)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, member)
}

func (h *SitesHandler) UpdateSiteMember(c *gin.Context) {
	userID := c.GetString("user_id")
	siteID := c.Param("site_id")
	memberID := c.Param("member_id")

	if !h.requireSitePermission(c, userID, siteID, "users:write") {
		c.JSON(http.StatusNotFound, gin.H{"error": "Site not found"})
		return
	}

	var req models.UpdateSiteMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	member, err := h.repo.UpdateSiteMemberRole(c.Request.Context(), siteID, memberID, req.Role)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, member)
}

func (h *SitesHandler) DeleteSiteMember(c *gin.Context) {
	userID := c.GetString("user_id")
	siteID := c.Param("site_id")
	memberID := c.Param("member_id")

	if !h.requireSitePermission(c, userID, siteID, "users:delete") {
		c.JSON(http.StatusNotFound, gin.H{"error": "Site not found"})
		return
	}

	if err := h.repo.RemoveSiteMember(c.Request.Context(), siteID, memberID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Member removed"})
}

func (h *SitesHandler) SendDebugEvent(c *gin.Context) {
	userID := c.GetString("user_id")
	siteID := c.Param("site_id")

	if !h.requireSitePermission(c, userID, siteID, "site:write") {
		c.JSON(http.StatusNotFound, gin.H{"error": "Site not found"})
		return
	}

	var req models.DebugEventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if !isSupportedDebugEvent(req.EventName) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Unsupported debug event"})
		return
	}

	event := buildDebugEvent(req.EventName)
	if err := h.collector.CollectEvent(c.Request.Context(), siteID, &event, ingest.HashIP("dashboard-debug")); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	_ = h.repo.RecordTrackingEvent(c.Request.Context(), siteID)

	c.JSON(http.StatusOK, models.EventResponse{
		EventID:    event.EventID,
		Status:     "ok",
		ReceivedAt: time.Now().Format(time.RFC3339Nano),
	})
}

func (h *SitesHandler) requireSitePermission(c *gin.Context, userID, siteID, permission string) bool {
	allowed, err := h.repo.UserHasSitePermission(c.Request.Context(), userID, siteID, permission)
	return err == nil && allowed
}

func isSupportedDebugEvent(eventName string) bool {
	switch eventName {
	case "pageview", "product_view", "add_to_cart", "checkout_start", "purchase":
		return true
	default:
		return false
	}
}

func buildDebugEvent(eventName string) models.Event {
	event := models.Event{
		EventID:   uuid.New().String(),
		EventTime: time.Now().Format(time.RFC3339Nano),
		EventName: eventName,
		ClientID:  uuid.New().String(),
		SessionID: uuid.New().String(),
		URL:       "https://dashboard.woosaas.local/debug",
		Path:      "/debug",
		UserAgent: "woosaas-dashboard-debug",
		Properties: map[string]interface{}{
			"source":       "dashboard_debug",
			"debug_origin": "dashboard",
		},
	}

	if eventName == "product_view" || eventName == "add_to_cart" || eventName == "checkout_start" || eventName == "purchase" {
		event.ProductID = "debug-product-1"
		event.ProductName = "Debug Product"
	}

	if eventName == "add_to_cart" || eventName == "purchase" {
		event.Quantity = 1
		event.Revenue = 29.99
		event.Currency = "USD"
	}

	if eventName == "purchase" {
		event.OrderID = "debug-order-" + time.Now().UTC().Format("20060102150405")
	}

	return event
}
