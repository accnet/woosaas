package handlers

import (
	"net/http"

	"github.com/accnet/woosaas/api/internal/shipment_tracking"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

type ShipmentTrackingHandler struct {
	svc   *shipment_tracking.Service
	sites siteAccessChecker
	redis *redis.Client
}

func NewShipmentTrackingHandler(svc *shipment_tracking.Service, sites siteAccessChecker, redisClient *redis.Client) *ShipmentTrackingHandler {
	return &ShipmentTrackingHandler{svc: svc, sites: sites, redis: redisClient}
}

func (h *ShipmentTrackingHandler) List(c *gin.Context) {
	siteID, wooOrderID := c.Param("site_id"), c.Param("woo_order_id")
	if !requireSiteAccess(c, h.sites, h.redis, siteID) {
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
	tracking, err := h.svc.Add(c.Request.Context(), siteID, wooOrderID, req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, tracking)
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
