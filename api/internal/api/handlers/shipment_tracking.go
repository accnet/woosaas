package handlers

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/accnet/woosaas/api/internal/billing"
	"github.com/accnet/woosaas/api/internal/shipment_tracking"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

type ShipmentTrackingHandler struct {
	svc     *shipment_tracking.Service
	sites   siteAccessChecker
	redis   *redis.Client
	billing *billing.BillingService
}

func NewShipmentTrackingHandler(svc *shipment_tracking.Service, sites siteAccessChecker, redisClient *redis.Client, billingSvc *billing.BillingService) *ShipmentTrackingHandler {
	return &ShipmentTrackingHandler{svc: svc, sites: sites, redis: redisClient, billing: billingSvc}
}

func (h *ShipmentTrackingHandler) List(c *gin.Context) {
	siteID, wooOrderID := c.Param("site_id"), c.Param("woo_order_id")
	if !requireSiteAccess(c, h.sites, h.redis, siteID) {
		return
	}
	if !h.checkTrackingQuota(c, 0) {
		return
	}
	trackings, err := h.svc.List(c.Request.Context(), siteID, wooOrderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load shipment tracking"})
		return
	}
	c.JSON(http.StatusOK, trackings)
}

func (h *ShipmentTrackingHandler) Add(c *gin.Context) {
	siteID, wooOrderID := c.Param("site_id"), c.Param("woo_order_id")
	if !requireSiteAccess(c, h.sites, h.redis, siteID) {
		return
	}
	var req shipment_tracking.AddTrackingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !h.checkTrackingQuota(c, 1) {
		return
	}
	tracking, err := h.svc.Add(c.Request.Context(), siteID, wooOrderID, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, tracking)
}

func (h *ShipmentTrackingHandler) AddBatch(c *gin.Context) {
	siteID := c.Param("site_id")
	if !requireSiteAccess(c, h.sites, h.redis, siteID) {
		return
	}
	var req shipment_tracking.AddTrackingBatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !h.checkTrackingQuota(c, len(req.Trackings)) {
		return
	}
	result, err := h.svc.AddBatch(c.Request.Context(), siteID, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, result)
}

func (h *ShipmentTrackingHandler) checkTrackingQuota(c *gin.Context, incrementBy int) bool {
	if h.billing == nil {
		return true
	}
	userID := c.GetString("user_id")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
		return false
	}
	if err := h.billing.CheckSubscriptionAccess(c.Request.Context(), userID); err != nil {
		c.JSON(http.StatusPaymentRequired, gin.H{"error": "Subscription inactive"})
		return false
	}
	plan, err := h.billing.GetPlanForUser(c.Request.Context(), userID)
	if err != nil {
		return true
	}
	if !plan.HasFeature("order_tracking_api") || plan.TrackingOrderLimit == 0 {
		c.JSON(http.StatusPaymentRequired, gin.H{"error": "Order Tracking API not available on your plan"})
		return false
	}
	if plan.TrackingOrderLimit < 0 || incrementBy <= 0 || h.redis == nil {
		return true
	}
	now := time.Now().UTC()
	key := fmt.Sprintf("quota:tracking_orders:%s:%s", userID, now.Format("2006-01"))
	used, err := h.redis.IncrBy(c.Request.Context(), key, int64(incrementBy)).Result()
	if err != nil {
		return true
	}
	if used == int64(incrementBy) {
		nextMonth := time.Date(now.Year(), now.Month()+1, 1, 0, 0, 0, 0, time.UTC)
		h.redis.Expire(c.Request.Context(), key, time.Until(nextMonth))
	}
	if used > plan.TrackingOrderLimit {
		_, _ = h.redis.DecrBy(c.Request.Context(), key, int64(incrementBy)).Result()
		c.JSON(http.StatusPaymentRequired, gin.H{"error": "Order tracking quota exceeded"})
		return false
	}
	return true
}

func (h *ShipmentTrackingHandler) Refresh(c *gin.Context) {
	siteID, trackingID := c.Param("site_id"), c.Param("tracking_id")
	if !requireSiteAccess(c, h.sites, h.redis, siteID) {
		return
	}
	tracking, err := h.svc.Refresh(c.Request.Context(), siteID, trackingID)
	if err != nil {
		if shipment_tracking.IsNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Tracking not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to refresh tracking"})
		return
	}
	c.JSON(http.StatusOK, tracking)
}

func (h *ShipmentTrackingHandler) Delete(c *gin.Context) {
	siteID, trackingID := c.Param("site_id"), c.Param("tracking_id")
	if !requireSiteAccess(c, h.sites, h.redis, siteID) {
		return
	}
	if err := h.svc.Delete(c.Request.Context(), siteID, trackingID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete tracking"})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *ShipmentTrackingHandler) SaveWCPushConfig(c *gin.Context) {
	siteID := c.GetString("site_id")
	if siteID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "site_id missing from API key context"})
		return
	}
	var req shipment_tracking.UpdateWCPushConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.svc.SaveWCPushConfig(c.Request.Context(), siteID, req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *ShipmentTrackingHandler) TrackingMoreWebhook(c *gin.Context) {
	raw, err := io.ReadAll(io.LimitReader(c.Request.Body, 1<<20))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid webhook body"})
		return
	}
	c.Request.Body = io.NopCloser(bytes.NewReader(raw))

	secret, err := h.svc.TrackingMoreWebhookSecret(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Webhook secret could not be loaded"})
		return
	}
	if secret != "" && !trackingWebhookSecretMatches(c, secret) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid webhook secret"})
		return
	}
	applied, err := h.svc.ApplyTrackingMoreWebhook(c.Request.Context(), raw)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid webhook payload"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "updated": len(applied)})
}

func trackingWebhookSecretMatches(c *gin.Context, expected string) bool {
	for _, candidate := range []string{
		c.GetHeader("X-Woosaas-Webhook-Secret"),
		c.GetHeader("X-Trackingmore-Webhook-Secret"),
		c.GetHeader("X-TrackingMore-Webhook-Secret"),
		c.Query("secret"),
	} {
		if candidate == expected {
			return true
		}
	}
	return false
}
