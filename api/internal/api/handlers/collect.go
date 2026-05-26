package handlers

import (
	"fmt"
	"net/http"
	"net/netip"
	"strings"
	"time"

	"github.com/accnet/woosaas/api/internal/billing"
	"github.com/accnet/woosaas/api/internal/ingest"
	"github.com/accnet/woosaas/api/internal/sites"
	"github.com/accnet/woosaas/api/pkg/models"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

type CollectHandler struct {
	collector *ingest.Collector
	repo      sites.SiteRepository
	redis     *redis.Client
	billing   *billing.BillingService
}

func NewCollectHandler(collector *ingest.Collector, repo sites.SiteRepository, redisClient *redis.Client, billingSvc *billing.BillingService) *CollectHandler {
	return &CollectHandler{collector: collector, repo: repo, redis: redisClient, billing: billingSvc}
}

// CollectEvent handles single event ingestion
func (h *CollectHandler) CollectEvent(c *gin.Context) {
	siteID := c.GetString("site_id")
	if siteID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Site ID not found"})
		return
	}
	if !h.checkEventQuota(c, 1) {
		return
	}

	var event models.Event
	if err := c.ShouldBindJSON(&event); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.TrimSpace(event.UserAgent) == "" {
		event.UserAgent = c.Request.UserAgent()
	}

	if err := h.collector.ValidateEvent(&event); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get IP hash for privacy
	meta := ingest.RequestMetadata{
		ClientIP: c.ClientIP(),
		IPHash:   ingest.HashIP(c.ClientIP()),
		Country:  requestCountry(c),
		City:     requestCity(c),
	}

	// Check for duplicate
	isDup, err := h.collector.Deduplicate(c.Request.Context(), siteID, event.EventID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check duplicate event"})
		return
	}
	if isDup {
		c.JSON(http.StatusOK, models.EventResponse{
			EventID:    event.EventID,
			Status:     "duplicate",
			ReceivedAt: time.Now().Format(time.RFC3339Nano),
		})
		return
	}

	// Process event
	if err := h.collector.CollectEvent(c.Request.Context(), siteID, &event, meta); err != nil {
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

// CollectBatch handles batch event ingestion
func (h *CollectHandler) CollectBatch(c *gin.Context) {
	siteID := c.GetString("site_id")
	if siteID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Site ID not found"})
		return
	}

	var req models.BatchEventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(req.Events) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "events is required"})
		return
	}
	if !h.checkEventQuota(c, len(req.Events)) {
		return
	}

	// Get IP hash for privacy
	meta := ingest.RequestMetadata{
		ClientIP: c.ClientIP(),
		IPHash:   ingest.HashIP(c.ClientIP()),
		Country:  requestCountry(c),
		City:     requestCity(c),
	}

	queuedEvents := make([]models.Event, 0, len(req.Events))
	queuedIndexes := make([]int, 0, len(req.Events))
	responses := make([]models.EventResponse, len(req.Events))
	processed := false

	// Step 1: Validate all events locally without network calls
	validEvents := make([]models.Event, 0, len(req.Events))
	validIndexes := make([]int, 0, len(req.Events))
	eventIDs := make([]string, 0, len(req.Events))

	for i := range req.Events {
		event := req.Events[i]
		if strings.TrimSpace(event.UserAgent) == "" {
			event.UserAgent = c.Request.UserAgent()
		}
		if err := h.collector.ValidateEvent(&event); err != nil {
			responses[i] = models.EventResponse{
				EventID:    event.EventID,
				Status:     "error",
				ReceivedAt: time.Now().Format(time.RFC3339Nano),
			}
			continue
		}
		validEvents = append(validEvents, event)
		validIndexes = append(validIndexes, i)
		eventIDs = append(eventIDs, event.EventID)
	}

	// Step 2: Deduplicate in a single Redis Pipeline round-trip (C3)
	isDupBatch, err := h.collector.DeduplicateBatch(c.Request.Context(), siteID, eventIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check duplicate events"})
		return
	}

	for i, isDup := range isDupBatch {
		if isDup {
			responses[validIndexes[i]] = models.EventResponse{
				EventID:    validEvents[i].EventID,
				Status:     "duplicate",
				ReceivedAt: time.Now().Format(time.RFC3339Nano),
			}
			continue
		}
		queuedEvents = append(queuedEvents, validEvents[i])
		queuedIndexes = append(queuedIndexes, validIndexes[i])
	}

	// Process batch
	if len(queuedEvents) > 0 {
		batchResponses, err := h.collector.CollectBatch(c.Request.Context(), siteID, queuedEvents, meta)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		for i, response := range batchResponses {
			responses[queuedIndexes[i]] = response
			if response.Status == "ok" {
				processed = true
			}
		}
	}

	if processed {
		_ = h.repo.RecordTrackingEvent(c.Request.Context(), siteID)
	}

	c.JSON(http.StatusOK, gin.H{
		"events": responses,
	})
}

func requestCountry(c *gin.Context) string {
	for _, header := range []string{
		"CF-IPCountry",
		"CloudFront-Viewer-Country",
		"X-Country-Code",
		"X-Country",
		"X-Geo-Country",
	} {
		value := strings.TrimSpace(c.GetHeader(header))
		if value != "" && !strings.EqualFold(value, "XX") {
			return strings.ToUpper(value)
		}
	}
	if isPrivateOrLoopbackIP(c.ClientIP()) {
		return "LOCAL"
	}
	return ""
}

func requestCity(c *gin.Context) string {
	for _, header := range []string{
		"X-City",
		"X-Geo-City",
		"CloudFront-Viewer-City",
		"X-Appengine-City",
	} {
		value := strings.TrimSpace(c.GetHeader(header))
		if value != "" {
			return value
		}
	}
	if isPrivateOrLoopbackIP(c.ClientIP()) {
		return "Local"
	}
	return ""
}

func isPrivateOrLoopbackIP(value string) bool {
	addr, err := netip.ParseAddr(strings.TrimSpace(value))
	if err != nil {
		return false
	}
	return addr.IsPrivate() || addr.IsLoopback()
}

func (h *CollectHandler) checkEventQuota(c *gin.Context, count int) bool {
	if h.billing == nil || h.redis == nil {
		return true
	}
	siteValue, ok := c.Get("site")
	if !ok {
		return true
	}
	site, ok := siteValue.(*models.Site)
	if !ok || site.UserID == "" {
		return true
	}
	if err := h.billing.CheckSubscriptionAccess(c.Request.Context(), site.UserID); err != nil {
		c.JSON(http.StatusPaymentRequired, gin.H{"error": "Subscription inactive"})
		return false
	}
	plan, err := h.billing.GetPlanForUser(c.Request.Context(), site.UserID)
	if err != nil {
		return true
	}
	if plan.EventLimit <= 0 {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "Event quota exceeded"})
		return false
	}
	now := time.Now().UTC()
	period := now.Format("2006-01")
	key := fmt.Sprintf("quota:events:%s:%s", site.UserID, period)
	used, err := h.redis.IncrBy(c.Request.Context(), key, int64(count)).Result()
	if err != nil {
		return true
	}
	if used == int64(count) {
		nextMonth := time.Date(now.Year(), now.Month()+1, 1, 0, 0, 0, 0, time.UTC)
		h.redis.Expire(c.Request.Context(), key, time.Until(nextMonth))
	}
	if used > plan.EventLimit {
		_, _ = h.redis.DecrBy(c.Request.Context(), key, int64(count)).Result()
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "Event quota exceeded"})
		return false
	}
	return true
}

// Verify handles API key verification
func (h *CollectHandler) Verify(c *gin.Context) {
	siteID := c.GetString("site_id")
	if siteID == "" {
		c.JSON(http.StatusUnauthorized, models.VerifyResponse{
			Valid:   false,
			Message: "Site ID not found",
		})
		return
	}

	// Check if site exists in context
	if !c.IsAborted() {
		// Site access was already validated by middleware
	}

	// Extract domain from request
	domain := c.GetHeader("Origin")
	if domain == "" {
		domain = c.GetHeader("Referer")
	}
	if domain != "" {
		domain = strings.TrimPrefix(domain, "https://")
		domain = strings.TrimPrefix(domain, "http://")
		domain = strings.TrimPrefix(domain, "www.")
		if idx := strings.Index(domain, "/"); idx > 0 {
			domain = domain[:idx]
		}
	}
	_ = h.repo.MarkTrackingVerified(c.Request.Context(), siteID)

	c.JSON(http.StatusOK, models.VerifyResponse{
		Valid:   true,
		SiteID:  siteID,
		Domain:  domain,
		Message: "API key valid",
	})
}
