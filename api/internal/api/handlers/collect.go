package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/woosaas/api/internal/ingest"
	"github.com/woosaas/api/internal/sites"
	"github.com/woosaas/api/pkg/models"
)

type CollectHandler struct {
	collector *ingest.Collector
	repo      *sites.Repository
}

func NewCollectHandler(collector *ingest.Collector, repo *sites.Repository) *CollectHandler {
	return &CollectHandler{collector: collector, repo: repo}
}

// CollectEvent handles single event ingestion
func (h *CollectHandler) CollectEvent(c *gin.Context) {
	siteID := c.GetString("site_id")
	if siteID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Site ID not found"})
		return
	}

	var event models.Event
	if err := c.ShouldBindJSON(&event); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.collector.ValidateEvent(&event); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get IP hash for privacy
	ipHash := ingest.HashIP(c.ClientIP())

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
	if err := h.collector.CollectEvent(c.Request.Context(), siteID, &event, ipHash); err != nil {
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

	// Get IP hash for privacy
	ipHash := ingest.HashIP(c.ClientIP())

	queuedEvents := make([]models.Event, 0, len(req.Events))
	queuedIndexes := make([]int, 0, len(req.Events))
	responses := make([]models.EventResponse, len(req.Events))
	processed := false

	for i := range req.Events {
		event := req.Events[i]

		if err := h.collector.ValidateEvent(&event); err != nil {
			responses[i] = models.EventResponse{
				EventID:    event.EventID,
				Status:     "error",
				ReceivedAt: time.Now().Format(time.RFC3339Nano),
			}
			continue
		}

		isDup, err := h.collector.Deduplicate(c.Request.Context(), siteID, event.EventID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check duplicate events"})
			return
		}
		if isDup {
			responses[i] = models.EventResponse{
				EventID:    event.EventID,
				Status:     "duplicate",
				ReceivedAt: time.Now().Format(time.RFC3339Nano),
			}
			continue
		}

		queuedEvents = append(queuedEvents, event)
		queuedIndexes = append(queuedIndexes, i)
	}

	// Process batch
	if len(queuedEvents) > 0 {
		batchResponses, err := h.collector.CollectBatch(c.Request.Context(), siteID, queuedEvents, ipHash)
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
