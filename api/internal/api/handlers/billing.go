package handlers

import (
	"net/http"
	"time"

	"github.com/accnet/woosaas/api/internal/billing"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type BillingHandler struct {
	db      *pgxpool.Pool
	redis   *redis.Client
	billing *billing.BillingService
}

func NewBillingHandler(db *pgxpool.Pool, redisClient *redis.Client, billingSvc *billing.BillingService) *BillingHandler {
	return &BillingHandler{db: db, redis: redisClient, billing: billingSvc}
}

func (h *BillingHandler) Usage(c *gin.Context) {
	userID := c.GetString("user_id")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
		return
	}
	plan, err := h.billing.GetPlanForUser(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load plan"})
		return
	}
	sub, err := h.billing.GetSubscription(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load subscription"})
		return
	}
	var sitesUsed int
	_ = h.db.QueryRow(c.Request.Context(), `SELECT COUNT(*) FROM sites WHERE user_id = $1 AND deleted_at IS NULL`, userID).Scan(&sitesUsed)
	period := time.Now().UTC().Format("2006-01")
	eventsUsed := h.readRedisInt(c, "quota:events:"+userID+":"+period)
	trackingUsed := h.readRedisInt(c, "quota:tracking_orders:"+userID+":"+period)
	c.JSON(http.StatusOK, gin.H{
		"plan":         plan,
		"subscription": sub,
		"period":       period,
		"sites": gin.H{
			"used":  sitesUsed,
			"limit": plan.SiteLimit,
		},
		"events": gin.H{
			"used":  eventsUsed,
			"limit": plan.EventLimit,
		},
		"tracking_orders": gin.H{
			"used":  trackingUsed,
			"limit": plan.TrackingOrderLimit,
		},
	})
}

func (h *BillingHandler) Plans(c *gin.Context) {
	plans, err := h.billing.GetAllPlans(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to load plans"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"plans": plans})
}

func (h *BillingHandler) readRedisInt(c *gin.Context, key string) int64 {
	if h.redis == nil {
		return 0
	}
	v, err := h.redis.Get(c.Request.Context(), key).Int64()
	if err != nil {
		return 0
	}
	return v
}
