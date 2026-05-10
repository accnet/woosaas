package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/redis/go-redis/v9"
	"github.com/accnet/woosaas/api/internal/orders"
	"github.com/accnet/woosaas/api/internal/sites"
	"github.com/accnet/woosaas/api/pkg/models"
)

const maxWooOrderBatchSize = 100

type OrdersHandler struct {
	svc   *orders.Service
	sites sites.SiteRepository
	redis *redis.Client
}

func NewOrdersHandler(svc *orders.Service, sitesRepo sites.SiteRepository, redisClient *redis.Client) *OrdersHandler {
	return &OrdersHandler{
		svc:   svc,
		sites: sitesRepo,
		redis: redisClient,
	}
}

func (h *OrdersHandler) SyncOrders(c *gin.Context) {
	siteID := c.GetString("site_id")
	if siteID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "site_id missing from API key context"})
		return
	}

	var req models.WooOrderSyncRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(req.Orders) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "orders is required"})
		return
	}
	if len(req.Orders) > maxWooOrderBatchSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "batch limit exceeded"})
		return
	}

	if headerBoolDefault(c.GetHeader("X-Order-Sync-Enabled"), true) == false {
		c.JSON(http.StatusOK, models.WooOrderSyncResponse{
			Accepted: 0,
			Skipped:  len(req.Orders),
			Reason:   "order_sync_disabled",
		})
		return
	}

	contactSyncEnabled := headerBoolDefault(c.GetHeader("X-Contact-Sync-Enabled"), true)
	resp := models.WooOrderSyncResponse{
		Errors: make([]models.WooOrderError, 0),
	}

	for _, order := range req.Orders {
		if err := validateWooOrder(order); err != nil {
			resp.Rejected++
			resp.Errors = append(resp.Errors, models.WooOrderError{
				WooOrderID: order.WooOrderID,
				Error:      err.Error(),
			})
			continue
		}

		if err := h.svc.Enqueue(c.Request.Context(), siteID, order, contactSyncEnabled); err != nil {
			resp.Rejected++
			resp.Errors = append(resp.Errors, models.WooOrderError{
				WooOrderID: order.WooOrderID,
				Error:      "failed to queue order",
			})
			continue
		}

		resp.Accepted++
	}

	c.JSON(http.StatusOK, resp)
}

func (h *OrdersHandler) ListOrders(c *gin.Context) {
	siteID := c.Query("site_id")
	if siteID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "site_id is required"})
		return
	}
	if !h.requireSiteAccess(c, siteID) {
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "25"))

	filter := orders.ListOrdersParams{
		SiteID:            siteID,
		Page:              page,
		PageSize:          pageSize,
		Query:             c.Query("q"),
		PaymentStatus:     c.Query("payment_status"),
		FulfillmentStatus: c.Query("fulfillment_status"),
		Status:            c.Query("status"),
	}
	if dateFrom := c.Query("date_from"); dateFrom != "" {
		parsed, err := parseDateTime(dateFrom)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date_from"})
			return
		}
		filter.DateFrom = &parsed
	}
	if dateTo := c.Query("date_to"); dateTo != "" {
		parsed, err := parseDateTime(dateTo)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date_to"})
			return
		}
		filter.DateTo = &parsed
	}

	result, err := h.svc.ListOrders(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *OrdersHandler) GetOrderDetail(c *gin.Context) {
	siteID := c.Query("site_id")
	if siteID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "site_id is required"})
		return
	}
	if !h.requireSiteAccess(c, siteID) {
		return
	}

	orderID := c.Param("woo_order_id")
	detail, err := h.svc.GetOrderDetail(c.Request.Context(), siteID, orderID)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "order not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, detail)
}

func (h *OrdersHandler) ListContacts(c *gin.Context) {
	siteID := c.Query("site_id")
	if siteID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "site_id is required"})
		return
	}
	if !h.requireSiteAccess(c, siteID) {
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "25"))
	result, err := h.svc.ListContacts(c.Request.Context(), orders.ListContactsParams{
		SiteID:   siteID,
		Page:     page,
		PageSize: pageSize,
		Query:    c.Query("q"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

// GetRetentionCohort returns monthly cohort repeat-purchase rates.
func (h *OrdersHandler) GetRetentionCohort(c *gin.Context) {
	siteID := c.Query("site_id")
	if siteID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "site_id is required"})
		return
	}
	if !h.requireSiteAccess(c, siteID) {
		return
	}

	cohorts, err := h.svc.GetRetentionCohort(c.Request.Context(), siteID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, cohorts)
}

// GetRefundStats returns refund analytics.
func (h *OrdersHandler) GetRefundStats(c *gin.Context) {
	siteID := c.Query("site_id")
	from := c.Query("from")
	to := c.Query("to")
	if siteID == "" || from == "" || to == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "site_id, from, and to are required"})
		return
	}
	if !h.requireSiteAccess(c, siteID) {
		return
	}

	stats, err := h.svc.GetRefundStats(c.Request.Context(), siteID, from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, stats)
}

// GetCrossSell returns frequently co-purchased product pairs.
func (h *OrdersHandler) GetCrossSell(c *gin.Context) {
	siteID := c.Query("site_id")
	limitStr := c.DefaultQuery("limit", "20")
	limit, _ := strconv.Atoi(limitStr)
	if siteID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "site_id is required"})
		return
	}
	if !h.requireSiteAccess(c, siteID) {
		return
	}

	pairs, err := h.svc.GetCrossSell(c.Request.Context(), siteID, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, pairs)
}

func (h *OrdersHandler) GetSyncState(c *gin.Context) {
	siteID := c.Param("site_id")
	if siteID == "" {
		siteID = c.Query("site_id")
	}
	if siteID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "site_id is required"})
		return
	}
	if !h.requireSiteAccess(c, siteID) {
		return
	}

	state, err := h.svc.GetSyncState(c.Request.Context(), siteID)
	if err != nil {
		if err == pgx.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "sync state not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, state)
}

func (h *OrdersHandler) requireSiteAccess(c *gin.Context, siteID string) bool {
	return requireSiteAccess(c, h.sites, h.redis, siteID)
}

func validateWooOrder(order models.WooOrderInput) error {
	if strings.TrimSpace(order.WooOrderID) == "" {
		return errInvalidOrder("woo_order_id is required")
	}
	if strings.TrimSpace(order.ModifiedAtWoo) == "" {
		return errInvalidOrder("modified_at_woo is required")
	}
	if strings.TrimSpace(order.Status) == "" {
		return errInvalidOrder("status is required")
	}
	if strings.TrimSpace(order.Currency) == "" {
		return errInvalidOrder("currency is required")
	}
	if len(order.Items) == 0 {
		return errInvalidOrder("items is required")
	}
	if _, err := time.Parse(time.RFC3339Nano, order.ModifiedAtWoo); err != nil {
		if _, fallbackErr := time.Parse(time.RFC3339, order.ModifiedAtWoo); fallbackErr != nil {
			return errInvalidOrder("modified_at_woo is invalid")
		}
	}
	return nil
}

type invalidOrderError string

func (e invalidOrderError) Error() string { return string(e) }

func errInvalidOrder(message string) error {
	return invalidOrderError(message)
}

func headerBoolDefault(value string, fallback bool) bool {
	if value == "" {
		return fallback
	}
	value = strings.ToLower(strings.TrimSpace(value))
	return value == "1" || value == "true" || value == "yes" || value == "on"
}
