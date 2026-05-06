package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/woosaas/api/internal/auth"
	"github.com/woosaas/api/internal/sites"
)

// TenantMiddleware ensures tenant isolation
type TenantMiddleware struct {
	repo  *sites.Repository
	redis *redis.Client
}

func NewTenantMiddleware(repo *sites.Repository, redis *redis.Client) *TenantMiddleware {
	return &TenantMiddleware{repo: repo, redis: redis}
}

// EnforceSiteAccess verifies user has access to the site
func (m *TenantMiddleware) EnforceSiteAccess() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := c.GetString("user_id")
		siteID := c.Param("site_id")

		if siteID == "" {
			siteID = c.Query("site_id")
		}

		if siteID == "" {
			c.Next()
			return
		}

		// Check cache first
		cacheKey := "tenant:" + userID + ":" + siteID
		cached, err := m.redis.Get(c.Request.Context(), cacheKey).Result()
		if err == nil && cached == "1" {
			c.Set("site_id", siteID)
			c.Next()
			return
		}

		allowed, err := m.repo.UserHasSitePermission(c.Request.Context(), userID, siteID, "site:read")
		if err != nil || !allowed {
			c.JSON(http.StatusForbidden, gin.H{"error": "Access denied to this site"})
			c.Abort()
			return
		}

		// Cache for 5 minutes
		m.redis.Set(c.Request.Context(), cacheKey, "1", 5*60)

		c.Set("site_id", siteID)
		c.Next()
	}
}

// ValidateAPIKeySite ensures API key matches the site being accessed
func (m *TenantMiddleware) ValidateAPIKeySite() gin.HandlerFunc {
	return func(c *gin.Context) {
		siteID := c.GetHeader("X-Site-ID")
		apiKey := c.GetHeader("X-Api-Key")

		if siteID == "" || apiKey == "" {
			c.Next()
			return
		}

		// Validate API key belongs to this site
		cacheKey := "apikey_site:" + apiKey
		cachedSiteID, err := m.redis.Get(c.Request.Context(), cacheKey).Result()
		if err == nil {
			if cachedSiteID != siteID {
				c.JSON(http.StatusForbidden, gin.H{"error": "API key does not match site"})
				c.Abort()
				return
			}
		}

		c.Next()
	}
}

// InjectUserContext injects user context for analytics queries
func InjectUserContext(jwtManager *auth.JWTManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			c.Next()
			return
		}

		token := strings.TrimPrefix(authHeader, "Bearer ")
		claims, err := jwtManager.ValidateToken(token)
		if err != nil {
			c.Next()
			return
		}

		c.Set("user_id", claims.UserID)
		c.Set("email", claims.Email)
		c.Next()
	}
}

// CleanupTenantCache removes cached tenant access
func (m *TenantMiddleware) CleanupTenantCache(ctx context.Context, userID, siteID string) error {
	cacheKey := "tenant:" + userID + ":" + siteID
	return m.redis.Del(ctx, cacheKey).Err()
}
