package handlers

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

// siteAccessChecker is the minimal interface required to verify site:read permission.
type siteAccessChecker interface {
	UserHasSitePermission(ctx context.Context, userID, siteID, permission string) (bool, error)
}

// requireSiteAccess checks that the authenticated user has site:read permission.
// The result is cached in Redis for 5 minutes to avoid a Postgres round-trip on
// every analytics/orders request.
func requireSiteAccess(c *gin.Context, repo siteAccessChecker, redisClient *redis.Client, siteID string) bool {
	userID := c.GetString("user_id")
	cacheKey := fmt.Sprintf("perm:%s:%s", userID, siteID)

	if allowed, err := redisClient.Get(c.Request.Context(), cacheKey).Bool(); err == nil {
		if !allowed {
			c.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
			return false
		}
		return true
	}

	allowed, err := repo.UserHasSitePermission(c.Request.Context(), userID, siteID, "site:read")
	redisClient.Set(c.Request.Context(), cacheKey, allowed, 5*time.Minute)
	if err != nil || !allowed {
		c.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return false
	}
	return true
}
