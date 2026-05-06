package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/woosaas/api/internal/query"
	"github.com/woosaas/api/internal/realtime"
	"github.com/woosaas/api/internal/sites"
)

type StatsHandler struct {
	stats       *query.Stats
	onlineUsers *realtime.OnlineUsers
	repo        *sites.Repository
}

func NewStatsHandler(stats *query.Stats, onlineUsers *realtime.OnlineUsers, repo *sites.Repository) *StatsHandler {
	return &StatsHandler{
		stats:       stats,
		onlineUsers: onlineUsers,
		repo:        repo,
	}
}

// GetOverview returns overview statistics
func (h *StatsHandler) GetOverview(c *gin.Context) {
	siteID := c.Query("site_id")
	from := c.Query("from")
	to := c.Query("to")
	timezone := c.DefaultQuery("timezone", "UTC")

	if siteID == "" || from == "" || to == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "site_id, from, and to are required"})
		return
	}
	if !h.requireSiteAccess(c, siteID) {
		return
	}
	from, to, ok := normalizeDateRange(c, from, to)
	if !ok {
		return
	}

	stats, err := h.stats.GetOverview(c.Request.Context(), siteID, from, to, timezone)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, stats)
}

// GetTrend returns time series data
func (h *StatsHandler) GetTrend(c *gin.Context) {
	siteID := c.Query("site_id")
	from := c.Query("from")
	to := c.Query("to")
	timezone := c.DefaultQuery("timezone", "UTC")
	granularity := c.DefaultQuery("granularity", "day")

	if siteID == "" || from == "" || to == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "site_id, from, and to are required"})
		return
	}
	if !h.requireSiteAccess(c, siteID) {
		return
	}
	from, to, ok := normalizeDateRange(c, from, to)
	if !ok {
		return
	}

	trend, err := h.stats.GetTrend(c.Request.Context(), siteID, from, to, timezone, granularity)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if trend == nil {
		trend = []query.TrendPoint{}
	}

	c.JSON(http.StatusOK, trend)
}

// GetSources returns traffic source breakdown
func (h *StatsHandler) GetSources(c *gin.Context) {
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
	from, to, ok := normalizeDateRange(c, from, to)
	if !ok {
		return
	}

	sources, err := h.stats.GetSources(c.Request.Context(), siteID, from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if sources == nil {
		sources = []query.SourceStats{}
	}

	c.JSON(http.StatusOK, sources)
}

// GetPages returns top pages
func (h *StatsHandler) GetPages(c *gin.Context) {
	siteID := c.Query("site_id")
	from := c.Query("from")
	to := c.Query("to")
	limitStr := c.DefaultQuery("limit", "20")
	limit, _ := strconv.ParseInt(limitStr, 10, 64)
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	if siteID == "" || from == "" || to == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "site_id, from, and to are required"})
		return
	}
	if !h.requireSiteAccess(c, siteID) {
		return
	}
	from, to, ok := normalizeDateRange(c, from, to)
	if !ok {
		return
	}

	pages, err := h.stats.GetPages(c.Request.Context(), siteID, from, to, int(limit))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if pages == nil {
		pages = []query.PageStats{}
	}

	c.JSON(http.StatusOK, pages)
}

// GetProducts returns top products
func (h *StatsHandler) GetProducts(c *gin.Context) {
	siteID := c.Query("site_id")
	from := c.Query("from")
	to := c.Query("to")
	limitStr := c.DefaultQuery("limit", "20")
	limit, _ := strconv.ParseInt(limitStr, 10, 64)
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	if siteID == "" || from == "" || to == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "site_id, from, and to are required"})
		return
	}
	if !h.requireSiteAccess(c, siteID) {
		return
	}
	from, to, ok := normalizeDateRange(c, from, to)
	if !ok {
		return
	}

	products, err := h.stats.GetProducts(c.Request.Context(), siteID, from, to, int(limit))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if products == nil {
		products = []query.ProductStats{}
	}

	c.JSON(http.StatusOK, products)
}

// GetFunnel returns funnel conversion data
func (h *StatsHandler) GetFunnel(c *gin.Context) {
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
	from, to, ok := normalizeDateRange(c, from, to)
	if !ok {
		return
	}

	funnel, err := h.stats.GetFunnel(c.Request.Context(), siteID, from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, funnel)
}

// GetRealtime returns online users count
func (h *StatsHandler) GetRealtime(c *gin.Context) {
	siteID := c.Query("site_id")
	minutesStr := c.DefaultQuery("minutes", "5")
	minutes, _ := strconv.ParseInt(minutesStr, 10, 64)
	if minutes <= 0 || minutes > 60 {
		minutes = 5
	}

	if siteID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "site_id is required"})
		return
	}
	if !h.requireSiteAccess(c, siteID) {
		return
	}

	count, err := h.onlineUsers.GetOnlineCount(c.Request.Context(), siteID, int(minutes))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"online_users": count,
		"minutes":      minutes,
	})
}

// GetBots returns bot statistics
func (h *StatsHandler) GetBots(c *gin.Context) {
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

	// Simplified bot stats - in production this would be a proper query
	c.JSON(http.StatusOK, gin.H{
		"message": "Bot report - coming in Phase 6",
		"site_id": siteID,
	})
}

func (h *StatsHandler) requireSiteAccess(c *gin.Context, siteID string) bool {
	userID := c.GetString("user_id")
	hasAccess, err := h.repo.UserHasAccessToSite(c.Request.Context(), userID, siteID)
	if err != nil || !hasAccess {
		c.JSON(http.StatusNotFound, gin.H{"error": "Site not found"})
		return false
	}
	return true
}

func normalizeDateRange(c *gin.Context, from, to string) (string, string, bool) {
	parsedFrom, err := parseDateTime(from)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid from timestamp"})
		return "", "", false
	}
	parsedTo, err := parseDateTime(to)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid to timestamp"})
		return "", "", false
	}
	return formatClickHouseTime(parsedFrom), formatClickHouseTime(parsedTo), true
}

func parseDateTime(value string) (time.Time, error) {
	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05",
		"2006-01-02",
	}
	var lastErr error
	for _, layout := range layouts {
		parsed, err := time.Parse(layout, value)
		if err == nil {
			return parsed, nil
		}
		lastErr = err
	}
	return time.Time{}, lastErr
}

func formatClickHouseTime(value time.Time) string {
	return value.UTC().Format("2006-01-02 15:04:05.000")
}
