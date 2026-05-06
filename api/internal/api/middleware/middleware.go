package middleware

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/woosaas/api/internal/auth"
	"github.com/woosaas/api/internal/observability"
	"github.com/woosaas/api/internal/sites"
)

type Middleware struct {
	jwtManager *auth.JWTManager
	redis      *redis.Client
}

func NewMiddleware(jwtManager *auth.JWTManager, redis *redis.Client) *Middleware {
	return &Middleware{
		jwtManager: jwtManager,
		redis:      redis,
	}
}

// CORS handles Cross-Origin Resource Sharing
func (m *Middleware) CORS() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Api-Key, X-Site-ID, Authorization")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

// JWT auth for dashboard APIs
func (m *Middleware) JWTAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}

		if !strings.HasPrefix(authHeader, "Bearer ") {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header must use Bearer scheme"})
			c.Abort()
			return
		}

		token := strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Bearer token required"})
			c.Abort()
			return
		}

		claims, err := m.jwtManager.ValidateToken(token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			c.Abort()
			return
		}

		c.Set("user_id", claims.UserID)
		c.Set("email", claims.Email)
		c.Next()
	}
}

// API key auth for event collection
func (m *Middleware) APIKeyAuth(repo *sites.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Accept API key from X-Api-Key header or api_key query param
		// (sendBeacon cannot set custom headers, so query param is required)
		apiKey := c.GetHeader("X-Api-Key")
		if apiKey == "" {
			apiKey = c.Query("api_key")
		}
		if apiKey == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "API key required (X-Api-Key header or api_key query param)"})
			c.Abort()
			return
		}

		// Validate API key and get site_id
		site, err := repo.ValidateAPIKey(c.Request.Context(), apiKey)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid API key"})
			c.Abort()
			return
		}

		c.Set("site_id", site.ID)
		c.Set("site", site)
		c.Next()
	}
}

// Rate limit: 100 requests/minute per site
func (m *Middleware) RateLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		siteID := c.GetString("site_id")
		if siteID == "" {
			siteID = c.GetHeader("X-Site-ID")
		}
		if siteID == "" {
			siteID = "unknown"
		}

		key := "rate:" + siteID + ":" + strconv.FormatInt(time.Now().Unix()/60, 10)
		count, err := m.redis.Incr(c.Request.Context(), key).Result()
		if err != nil {
			c.Next()
			return
		}

		if count == 1 {
			m.redis.Expire(c.Request.Context(), key, 60*time.Second)
		}

		if count > 100 {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "Rate limit exceeded"})
			c.Abort()
			return
		}

		c.Next()
	}
}

// Metrics records HTTP request metrics
func (m *Middleware) Metrics() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()

		c.Next()

		duration := time.Since(start)
		status := strconv.Itoa(c.Writer.Status())

		observability.RecordRequest(c.Request.Method, c.FullPath(), status, duration)
	}
}

// Recovery handles panics
func (m *Middleware) Recovery(logger *observability.StructuredLogger) gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
				logger.LogError(c.Request.Context(), "panic", nil, gin.H{"error": err})
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal server error"})
				c.Abort()
			}
		}()
		c.Next()
	}
}
