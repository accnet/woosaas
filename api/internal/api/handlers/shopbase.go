package handlers

import (
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	appCrypto "github.com/accnet/woosaas/api/internal/crypto"
	"github.com/accnet/woosaas/api/internal/shopbase"
	"github.com/accnet/woosaas/api/internal/sites"
	"github.com/accnet/woosaas/api/pkg/models"
	"github.com/gin-gonic/gin"
)

// V1 required webhook topics for ShopBase.
var requiredWebhookTopics = []string{
	"orders/create",
	"orders/updated",
	"orders/paid",
	"orders/cancelled",
	"orders/fulfilled",
	"orders/partially_fulfilled",
	"orders/delete",
	"refunds/create",
	"fulfillments/create",
	"fulfillments/update",
	"products/create",
	"products/update",
	"products/delete",
	"shop/update",
	"app/uninstalled",
}

// ShopBaseHandler handles ShopBase integration API endpoints.
type ShopBaseHandler struct {
	repo           sites.SiteRepository
	encryptionKey  []byte
	trackerBaseURL string
	apiBaseURL     string
}

// NewShopBaseHandler creates a new ShopBaseHandler.
func NewShopBaseHandler(repo sites.SiteRepository, encryptionKey []byte, trackerBaseURL, apiBaseURL string) *ShopBaseHandler {
	return &ShopBaseHandler{
		repo:           repo,
		encryptionKey:  encryptionKey,
		trackerBaseURL: trackerBaseURL,
		apiBaseURL:     apiBaseURL,
	}
}

// VerifyStore verifies ShopBase credentials before connecting.
// POST /api/v1/sites/shopbase/verify
func (h *ShopBaseHandler) VerifyStore(c *gin.Context) {
	var req models.ShopBaseVerifyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	client := shopbase.NewClient(req.ShopDomain, shopbase.Auth{
		APIKey:      req.APIKey,
		APIPassword: req.APIPassword,
	})

	shop, err := client.GetShop(c.Request.Context())
	if err != nil {
		if errors.Is(err, shopbase.ErrUnauthorized) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid API credentials"})
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": "Could not reach ShopBase store: " + sanitizeError(err)})
		return
	}

	meta := shopbase.MapShopToMetadata(*shop)
	c.JSON(http.StatusOK, models.ShopBaseVerifyResponse{OK: true, Shop: meta})
}

// ConnectSite creates a new ShopBase site.
// POST /api/v1/sites/shopbase
func (h *ShopBaseHandler) ConnectSite(c *gin.Context) {
	userID := c.GetString("user_id")
	var req models.ShopBaseConnectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Default sync options to all enabled
	syncOpts := req.SyncOptions
	if !syncOpts.Orders && !syncOpts.Customers && !syncOpts.Products {
		syncOpts = models.SyncOptions{Orders: true, Customers: true, Products: true}
	}

	// Verify credentials
	client := shopbase.NewClient(req.ShopDomain, shopbase.Auth{
		APIKey:      req.APIKey,
		APIPassword: req.APIPassword,
	})
	shop, err := client.GetShop(c.Request.Context())
	if err != nil {
		if errors.Is(err, shopbase.ErrUnauthorized) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid API credentials"})
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": "Could not reach ShopBase store"})
		return
	}

	meta := shopbase.MapShopToMetadata(*shop)

	// Encrypt credentials
	apiKeyEnc, err := appCrypto.Encrypt(req.APIKey, h.encryptionKey)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Encryption error"})
		return
	}
	apiPassEnc, err := appCrypto.Encrypt(req.APIPassword, h.encryptionKey)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Encryption error"})
		return
	}

	// ShopBase signs webhooks with the app credential secret. For private app
	// integrations we use the API password as the shared webhook secret.
	webhookSecretEnc, err := appCrypto.Encrypt(req.APIPassword, h.encryptionKey)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Encryption error"})
		return
	}

	site, err := h.repo.CreateShopBaseSite(c.Request.Context(), userID, meta, apiKeyEnc, apiPassEnc, webhookSecretEnc, syncOpts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create site"})
		return
	}

	c.JSON(http.StatusCreated, site)
}

// GetIntegration returns integration status for a site.
// GET /api/v1/sites/:site_id/integration
func (h *ShopBaseHandler) GetIntegration(c *gin.Context) {
	siteID := c.Param("site_id")
	if !h.requireSiteAccess(c, siteID) {
		return
	}

	integration, err := h.repo.GetSiteIntegration(c.Request.Context(), siteID, "shopbase")
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Integration not found"})
		return
	}

	syncState, _ := h.repo.GetShopBaseSyncState(c.Request.Context(), siteID)
	scriptStatus := models.ScriptTagStatus{Installed: false}
	if client, clientErr := h.buildClient(c, siteID); clientErr == nil {
		trackerURL, trackerErr := h.trackerURL(c, siteID, false)
		if trackerErr == nil {
			scriptStatus = h.lookupScriptTag(c, client, trackerURL)
		} else if strings.Contains(trackerErr.Error(), "tracking API key") {
			scriptStatus.Reason = "tracking_key_missing"
		} else {
			scriptStatus.Reason = "tracker_url_invalid"
		}
	} else {
		scriptStatus.Reason = "credential_unavailable"
	}

	resp := models.ShopBaseIntegrationStatus{
		Platform:   "shopbase",
		Status:     integration.Status,
		ShopDomain: integration.ShopDomain,
		ScriptTag:  scriptStatus,
		SyncState:  syncState,
	}
	c.JSON(http.StatusOK, resp)
}

// GetSyncState returns the ShopBase sync state.
// GET /api/v1/sites/:site_id/integration/shopbase/sync-state
func (h *ShopBaseHandler) GetSyncState(c *gin.Context) {
	siteID := c.Param("site_id")
	if !h.requireSiteAccess(c, siteID) {
		return
	}
	state, err := h.repo.GetShopBaseSyncState(c.Request.Context(), siteID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Sync state not found"})
		return
	}
	c.JSON(http.StatusOK, state)
}

// InstallScript installs the Woosaas tracking script via ShopBase ScriptTag API.
// POST /api/v1/sites/:site_id/integration/shopbase/install-script
func (h *ShopBaseHandler) InstallScript(c *gin.Context) {
	siteID := c.Param("site_id")
	if !h.requireSiteAccess(c, siteID) {
		return
	}

	client, err := h.buildClient(c, siteID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	trackerURL, err := h.trackerURL(c, siteID, true)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Check for existing script tag
	tags, err := client.ListScriptTags(c.Request.Context())
	if err != nil {
		if errors.Is(err, shopbase.ErrUnauthorized) {
			c.JSON(http.StatusForbidden, gin.H{
				"installed":        false,
				"reason":           "permission_required",
				"fallback_snippet": h.manualSnippet(trackerURL),
			})
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to list script tags"})
		return
	}

	for _, tag := range tags {
		if sameTrackerScript(tag.Src, trackerURL) {
			c.JSON(http.StatusOK, gin.H{"installed": true, "already_existed": true, "script_tag_id": tag.ID, "src": tag.Src})
			return
		}
	}

	tag, err := client.CreateScriptTag(c.Request.Context(), trackerURL, "all")
	if err != nil {
		if errors.Is(err, shopbase.ErrUnauthorized) {
			c.JSON(http.StatusForbidden, gin.H{
				"installed":        false,
				"reason":           "permission_required",
				"fallback_snippet": h.manualSnippet(trackerURL),
			})
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to create script tag"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"installed": true, "script_tag_id": tag.ID, "src": tag.Src})
}

// RegisterWebhooks registers all required ShopBase webhooks.
// POST /api/v1/sites/:site_id/integration/shopbase/register-webhooks
func (h *ShopBaseHandler) RegisterWebhooks(c *gin.Context) {
	siteID := c.Param("site_id")
	if !h.requireSiteAccess(c, siteID) {
		return
	}

	client, err := h.buildClient(c, siteID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	webhookURL := fmt.Sprintf("%s/api/v1/shopbase/webhooks/%s", h.apiBaseURL, siteID)

	existing, err := client.ListWebhooks(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to list webhooks"})
		return
	}

	existingTopics := make(map[string]bool, len(existing))
	for _, w := range existing {
		existingTopics[w.Topic] = true
	}

	registered := 0
	alreadyExisted := 0
	var missing []string

	for _, topic := range requiredWebhookTopics {
		if existingTopics[topic] {
			alreadyExisted++
			continue
		}
		if _, err := client.CreateWebhook(c.Request.Context(), topic, webhookURL); err != nil {
			missing = append(missing, topic)
		} else {
			registered++
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"registered":      registered,
		"already_existed": alreadyExisted,
		"failed":          missing,
	})
}

// StartBackfill enqueues a backfill job for ShopBase orders.
// POST /api/v1/sites/:site_id/integration/shopbase/backfill
func (h *ShopBaseHandler) StartBackfill(c *gin.Context) {
	siteID := c.Param("site_id")
	if !h.requireSiteAccess(c, siteID) {
		return
	}

	// Verify integration exists
	_, err := h.repo.GetSiteIntegration(c.Request.Context(), siteID, "shopbase")
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ShopBase integration not found"})
		return
	}

	// Check not already running
	state, err := h.repo.GetShopBaseSyncState(c.Request.Context(), siteID)
	if err == nil && state.Status == "running" {
		c.JSON(http.StatusConflict, gin.H{"error": "Backfill already running"})
		return
	}

	if err := h.repo.MarkShopBaseSyncStatus(c.Request.Context(), siteID, "running"); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update sync state"})
		return
	}

	// The actual backfill is triggered via the backfill queue (see worker/shopbase_consumer.go).
	// For now, the handler just marks status. The worker picks it up via a periodic check.
	c.JSON(http.StatusOK, gin.H{"started": true})
}

// --- helpers ---

func (h *ShopBaseHandler) buildClient(c *gin.Context, siteID string) (*shopbase.Client, error) {
	apiKeyEnc, apiPassEnc, _, err := h.repo.GetSiteIntegrationCredentials(c.Request.Context(), siteID, "shopbase")
	if err != nil {
		return nil, fmt.Errorf("integration not found")
	}
	if len(h.encryptionKey) == 0 {
		return nil, fmt.Errorf("encryption not configured")
	}
	apiKey, err := appCrypto.Decrypt(apiKeyEnc, h.encryptionKey)
	if err != nil {
		return nil, fmt.Errorf("credential decryption failed")
	}
	apiPass, err := appCrypto.Decrypt(apiPassEnc, h.encryptionKey)
	if err != nil {
		return nil, fmt.Errorf("credential decryption failed")
	}

	integration, err := h.repo.GetSiteIntegration(c.Request.Context(), siteID, "shopbase")
	if err != nil {
		return nil, fmt.Errorf("integration not found")
	}

	return shopbase.NewClient(integration.ShopDomain, shopbase.Auth{
		APIKey:      apiKey,
		APIPassword: apiPass,
	}), nil
}

func (h *ShopBaseHandler) trackerURL(c *gin.Context, siteID string, createKey bool) (string, error) {
	base := strings.TrimRight(strings.TrimSpace(h.trackerBaseURL), "/")
	if base == "" {
		return "", fmt.Errorf("TRACKER_BASE_URL is not configured")
	}
	parsedBase, err := url.Parse(base)
	if err != nil || parsedBase.Scheme == "" || parsedBase.Host == "" {
		return "", fmt.Errorf("TRACKER_BASE_URL must be an absolute URL")
	}
	host := parsedBase.Hostname()
	if parsedBase.Scheme != "https" && host != "localhost" && host != "127.0.0.1" && host != "::1" {
		return "", fmt.Errorf("TRACKER_BASE_URL must use HTTPS outside local development")
	}
	apiKey, err := h.trackingAPIKey(c, siteID, createKey)
	if err != nil {
		return "", err
	}
	values := url.Values{}
	values.Set("site_id", siteID)
	values.Set("api_key", apiKey)
	collectURL, err := h.collectURL()
	if err != nil {
		return "", err
	}
	values.Set("collect_url", collectURL)
	return fmt.Sprintf("%s/tracker.js?%s", base, values.Encode()), nil
}

func (h *ShopBaseHandler) collectURL() (string, error) {
	base := strings.TrimRight(strings.TrimSpace(h.apiBaseURL), "/")
	if base == "" {
		return "", fmt.Errorf("API_BASE_URL is not configured")
	}
	parsedBase, err := url.Parse(base)
	if err != nil || parsedBase.Scheme == "" || parsedBase.Host == "" {
		return "", fmt.Errorf("API_BASE_URL must be an absolute URL")
	}
	host := parsedBase.Hostname()
	if parsedBase.Scheme != "https" && host != "localhost" && host != "127.0.0.1" && host != "::1" {
		return "", fmt.Errorf("API_BASE_URL must use HTTPS outside local development")
	}
	return base + "/api/v1/collect", nil
}

func (h *ShopBaseHandler) trackingAPIKey(c *gin.Context, siteID string, create bool) (string, error) {
	encrypted, err := h.repo.GetTrackingAPIKey(c.Request.Context(), siteID)
	if err == nil && encrypted != "" {
		key, decryptErr := appCrypto.Decrypt(encrypted, h.encryptionKey)
		if decryptErr == nil && key != "" {
			return key, nil
		}
	}
	if !create {
		return "", fmt.Errorf("tracking API key is not installed")
	}

	key, err := h.repo.CreateTrackingAPIKey(c.Request.Context(), siteID, sites.ShopBaseTrackingAPIKeyName)
	if err != nil {
		return "", fmt.Errorf("failed to create tracking API key")
	}
	encryptedKey, err := appCrypto.Encrypt(key.Key, h.encryptionKey)
	if err != nil {
		return "", fmt.Errorf("failed to encrypt tracking API key")
	}
	if err := h.repo.SetShopBaseTrackingAPIKey(c.Request.Context(), siteID, encryptedKey); err != nil {
		return "", fmt.Errorf("failed to store tracking API key")
	}
	return key.Key, nil
}

func (h *ShopBaseHandler) lookupScriptTag(c *gin.Context, client *shopbase.Client, trackerURL string) models.ScriptTagStatus {
	tags, err := client.ListScriptTags(c.Request.Context())
	if err != nil {
		if errors.Is(err, shopbase.ErrUnauthorized) {
			return models.ScriptTagStatus{Installed: false, Reason: "permission_required"}
		}
		return models.ScriptTagStatus{Installed: false, Reason: "status_unavailable"}
	}
	for _, tag := range tags {
		if sameTrackerScript(tag.Src, trackerURL) {
			return models.ScriptTagStatus{Installed: true, ID: tag.ID, Src: tag.Src}
		}
	}
	return models.ScriptTagStatus{Installed: false, Reason: "missing"}
}

func sameTrackerScript(existingSrc, expectedSrc string) bool {
	existing, err := url.Parse(existingSrc)
	if err != nil {
		return false
	}
	expected, err := url.Parse(expectedSrc)
	if err != nil {
		return false
	}
	if existing.Scheme != expected.Scheme || existing.Host != expected.Host || existing.Path != expected.Path {
		return false
	}
	return existing.Query().Get("site_id") == expected.Query().Get("site_id")
}

func (h *ShopBaseHandler) manualSnippet(trackerURL string) string {
	return fmt.Sprintf(`<script async src="%s"></script>`, trackerURL)
}

func sanitizeError(err error) string {
	msg := err.Error()
	if len(msg) > 100 {
		return msg[:100]
	}
	return msg
}

func (h *ShopBaseHandler) requireSiteAccess(c *gin.Context, siteID string) bool {
	userID := c.GetString("user_id")
	if userID == "" || siteID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return false
	}
	ok, err := h.repo.UserHasAccessToSite(c.Request.Context(), userID, siteID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to verify site access"})
		return false
	}
	if !ok {
		c.JSON(http.StatusForbidden, gin.H{"error": "site access denied"})
		return false
	}
	return true
}

// loadEncryptionKey decodes a base64-encoded 32-byte AES key.
func LoadEncryptionKey(b64 string) ([]byte, error) {
	if b64 == "" {
		return make([]byte, 32), nil // dev fallback — insecure, logs warning
	}
	key, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return nil, fmt.Errorf("INTEGRATION_ENCRYPTION_KEY is not valid base64: %w", err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("INTEGRATION_ENCRYPTION_KEY must decode to exactly 32 bytes, got %d", len(key))
	}
	return key, nil
}
