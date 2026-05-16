package handlers

import (
	"io"
	"net/http"

	appCrypto "github.com/accnet/woosaas/api/internal/crypto"
	"github.com/accnet/woosaas/api/internal/shopbase"
	"github.com/accnet/woosaas/api/internal/sites"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

const shopbaseWebhookStream = "shopbase:webhook_events"

// ShopBaseWebhookHandler receives incoming ShopBase webhook events.
type ShopBaseWebhookHandler struct {
	repo          sites.SiteRepository
	redis         *redis.Client
	encryptionKey []byte
}

// NewShopBaseWebhookHandler creates a ShopBaseWebhookHandler.
func NewShopBaseWebhookHandler(repo sites.SiteRepository, redis *redis.Client, encryptionKey []byte) *ShopBaseWebhookHandler {
	return &ShopBaseWebhookHandler{repo: repo, redis: redis, encryptionKey: encryptionKey}
}

// Receive handles POST /api/v1/shopbase/webhooks/:site_id
// This endpoint has no JWT auth — it's authenticated via HMAC verification.
func (h *ShopBaseWebhookHandler) Receive(c *gin.Context) {
	siteID := c.Param("site_id")

	// Read raw body for HMAC verification
	rawBody, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}

	// Load integration credentials for HMAC secret
	_, _, webhookSecretEnc, err := h.repo.GetSiteIntegrationCredentials(c.Request.Context(), siteID, "shopbase")
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}

	// Decrypt webhook secret
	if webhookSecretEnc == "" || len(h.encryptionKey) == 0 {
		c.Status(http.StatusUnauthorized)
		return
	}
	webhookSecret, err := appCrypto.Decrypt(webhookSecretEnc, h.encryptionKey)
	if err != nil || webhookSecret == "" {
		c.Status(http.StatusUnauthorized)
		return
	}

	hmacHeader := c.GetHeader("X-ShopBase-Hmac-SHA256")
	if !shopbase.VerifyHMAC(rawBody, hmacHeader, webhookSecret) {
		c.Status(http.StatusUnauthorized)
		return
	}

	topic := c.GetHeader("X-ShopBase-Topic")
	shopDomain := c.GetHeader("X-ShopBase-Shop-Domain")

	// Enqueue to Redis stream for async processing
	if err := h.redis.XAdd(c.Request.Context(), &redis.XAddArgs{
		Stream: shopbaseWebhookStream,
		Values: map[string]interface{}{
			"site_id":     siteID,
			"topic":       topic,
			"shop_domain": shopDomain,
			"payload":     string(rawBody),
		},
	}).Err(); err != nil {
		// Log the failure but return 200 so ShopBase doesn't retry
		_ = err
	}

	// Update last_webhook_at asynchronously (best-effort)
	_ = h.repo.MarkShopBaseWebhookReceived(c.Request.Context(), siteID)

	c.Status(http.StatusOK)
}
