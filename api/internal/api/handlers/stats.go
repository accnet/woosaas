package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/woosaas/api/internal/customer360"
	"github.com/woosaas/api/internal/export"
	"github.com/woosaas/api/internal/query"
	"github.com/woosaas/api/internal/realtime"
	"github.com/woosaas/api/internal/sites"
)

type StatsHandler struct {
	stats       *query.Stats
	bots        *query.Bots
	onlineUsers *realtime.OnlineUsers
	repo        *sites.Repository
	redis       *redis.Client
	exports     *export.ExportService
	customers   *customer360.CustomerService
}

func NewStatsHandler(
	stats *query.Stats,
	bots *query.Bots,
	onlineUsers *realtime.OnlineUsers,
	repo *sites.Repository,
	redisClient *redis.Client,
	exports *export.ExportService,
	customers *customer360.CustomerService,
) *StatsHandler {
	return &StatsHandler{
		stats:       stats,
		bots:        bots,
		onlineUsers: onlineUsers,
		repo:        repo,
		redis:       redisClient,
		exports:     exports,
		customers:   customers,
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

// GetCampaigns returns source / medium / campaign performance.
func (h *StatsHandler) GetCampaigns(c *gin.Context) {
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

	campaigns, err := h.stats.GetCampaigns(c.Request.Context(), siteID, from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if campaigns == nil {
		campaigns = []query.CampaignStats{}
	}

	c.JSON(http.StatusOK, campaigns)
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

	previousFrom, previousTo, ok := previousDateRange(c, from, to)
	if !ok {
		return
	}

	pages, err := h.stats.GetPages(c.Request.Context(), siteID, from, to, previousFrom, previousTo, int(limit))
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

	previousFrom, previousTo, ok := previousDateRange(c, from, to)
	if !ok {
		return
	}

	products, err := h.stats.GetProducts(c.Request.Context(), siteID, from, to, previousFrom, previousTo, int(limit))
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

// GetRealtimeEvents returns latest event feed.
func (h *StatsHandler) GetRealtimeEvents(c *gin.Context) {
	siteID := c.Query("site_id")
	minutesStr := c.DefaultQuery("minutes", "5")
	limitStr := c.DefaultQuery("limit", "25")
	minutes, _ := strconv.ParseInt(minutesStr, 10, 64)
	limit, _ := strconv.ParseInt(limitStr, 10, 64)

	if siteID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "site_id is required"})
		return
	}
	if !h.requireSiteAccess(c, siteID) {
		return
	}

	events, err := h.stats.GetRealtimeEvents(c.Request.Context(), siteID, int(minutes), int(limit))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, events)
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
	from, to, ok := normalizeDateRange(c, from, to)
	if !ok {
		return
	}

	report, err := h.bots.GetReport(c.Request.Context(), siteID, from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, report)
}

// GetHealth returns queue and worker health for the current ingest pipeline.
func (h *StatsHandler) GetHealth(c *gin.Context) {
	siteID := c.Query("site_id")
	if siteID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "site_id is required"})
		return
	}
	if !h.requireSiteAccess(c, siteID) {
		return
	}

	health, err := h.stats.GetPipelineHealth(c.Request.Context(), siteID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, health)
}

// Export downloads CSV report data.
func (h *StatsHandler) Export(c *gin.Context) {
	siteID := c.Query("site_id")
	dataType := c.DefaultQuery("type", "events")
	from := c.Query("from")
	to := c.Query("to")

	if siteID == "" || from == "" || to == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "site_id, from, and to are required"})
		return
	}
	if !h.requireSiteAccess(c, siteID) {
		return
	}
	parsedFrom, err := parseDateTime(from)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid from timestamp"})
		return
	}
	parsedTo, err := parseDateTime(to)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid to timestamp"})
		return
	}

	data, filename, err := h.exports.Export(c.Request.Context(), export.ExportData{
		SiteID:   siteID,
		DataType: dataType,
		From:     parsedFrom,
		To:       parsedTo,
		Format:   "csv",
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", `attachment; filename="`+filename+`"`)
	c.Data(http.StatusOK, "text/csv; charset=utf-8", data)
}

// GetCustomers returns customer 360 list.
func (h *StatsHandler) GetCustomers(c *gin.Context) {
	siteID := c.Query("site_id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "25"))
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 25
	}

	if siteID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "site_id is required"})
		return
	}
	if !h.requireSiteAccess(c, siteID) {
		return
	}

	customers, err := h.customers.ListCustomers(c.Request.Context(), siteID, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, customers)
}

// GetCustomer returns customer profile and recent timeline.
func (h *StatsHandler) GetCustomer(c *gin.Context) {
	siteID := c.Query("site_id")
	clientID := c.Param("client_id")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if siteID == "" || clientID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "site_id and client_id are required"})
		return
	}
	if !h.requireSiteAccess(c, siteID) {
		return
	}

	customer, err := h.customers.GetCustomerDetail(c.Request.Context(), siteID, clientID, limit)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, customer)
}

// requireSiteAccess checks if the user can read the site.
// M1: Result is cached in Redis for 5 minutes to avoid a Postgres query on every metrics request.
func (h *StatsHandler) requireSiteAccess(c *gin.Context, siteID string) bool {
	userID := c.GetString("user_id")
	
	cacheKey := fmt.Sprintf("perm:%s:%s", userID, siteID)
	if allowed, err := h.redis.Get(c.Request.Context(), cacheKey).Bool(); err == nil {
		if !allowed {
			c.JSON(http.StatusNotFound, gin.H{"error": "Site not found"})
			return false
		}
		return true
	}

	allowed, err := h.repo.UserHasSitePermission(c.Request.Context(), userID, siteID, "site:read")
	
	// Cache the boolean result
	h.redis.Set(c.Request.Context(), cacheKey, allowed, 5*time.Minute)

	if err != nil || !allowed {
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

func previousDateRange(c *gin.Context, from, to string) (string, string, bool) {
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
	if !parsedTo.After(parsedFrom) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "to must be after from"})
		return "", "", false
	}
	duration := parsedTo.Sub(parsedFrom)
	previousTo := parsedFrom
	previousFrom := parsedFrom.Add(-duration)
	return formatClickHouseTime(previousFrom), formatClickHouseTime(previousTo), true
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
