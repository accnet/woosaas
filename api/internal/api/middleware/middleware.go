package middleware

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/accnet/woosaas/api/internal/auth"
	"github.com/accnet/woosaas/api/internal/observability"
	"github.com/accnet/woosaas/api/pkg/models"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

// apiKeyValidator is the minimal interface needed by APIKeyAuth.
// *sites.Repository satisfies this interface.
type apiKeyValidator interface {
	GetSiteByID(ctx context.Context, id string) (*models.Site, error)
	ValidateAPIKey(ctx context.Context, apiKey string) (*models.Site, error)
	TouchAPIKeyLastUsedByHash(ctx context.Context, keyHash string) error
}

type tenantAuthValidator interface {
	GetMemberByIDWithAccount(ctx context.Context, memberID string) (*models.UserMember, *models.User, error)
}

type Middleware struct {
	jwtManager     *auth.JWTManager
	tenantAuth     tenantAuthValidator
	redis          *redis.Client
	allowedOrigins map[string]struct{}
}

func NewMiddleware(jwtManager *auth.JWTManager, tenantAuth tenantAuthValidator, redis *redis.Client, allowedOrigins []string) *Middleware {
	origins := make(map[string]struct{}, len(allowedOrigins))
	for _, o := range allowedOrigins {
		origins[strings.TrimRight(o, "/")] = struct{}{}
	}
	return &Middleware{
		jwtManager:     jwtManager,
		tenantAuth:     tenantAuth,
		redis:          redis,
		allowedOrigins: origins,
	}
}

// CORS handles Cross-Origin Resource Sharing with a proper origin whitelist.
// Setting Access-Control-Allow-Origin to "*" while also sending
// Access-Control-Allow-Credentials: true is invalid per the spec and is
// rejected by all modern browsers — this version fixes that.
func (m *Middleware) CORS() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := strings.TrimRight(c.GetHeader("Origin"), "/")

		// Always vary on Origin so CDNs/proxies don't cache the wrong header
		c.Writer.Header().Set("Vary", "Origin")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Api-Key, X-Site-ID, Authorization")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")

		if origin != "" {
			if _, ok := m.allowedOrigins[origin]; ok {
				c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
				c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
			}
			// Unrecognised origins get no ACAO header — browser blocks the request
		}

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

// JWTAuth validates Bearer tokens and sets user_id / email in the context.
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

		if claims.TokenType != "" && claims.TokenType != "tenant" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			c.Abort()
			return
		}

		memberID := claims.MemberID
		if memberID == "" {
			// Legacy tokens used the account id as the JWT subject. Force clients to
			// re-authenticate once tenant members are enabled.
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Token must be refreshed"})
			c.Abort()
			return
		}

		member, account, err := m.tenantAuth.GetMemberByIDWithAccount(c.Request.Context(), memberID)
		if err != nil || account.ID != claims.UserID || account.Status != "active" || member.Status != "active" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			c.Abort()
			return
		}

		c.Set("user_id", account.ID)
		c.Set("account_id", account.ID)
		c.Set("member_id", member.ID)
		c.Set("member_role", member.Role)
		c.Set("email", member.Email)
		c.Next()
	}
}

// APIKeyAuth validates the API key (header or query param) and caches the
// result in Redis for 5 minutes to avoid per-request DB lookups.
func (m *Middleware) APIKeyAuth(repo apiKeyValidator) gin.HandlerFunc {
	return func(c *gin.Context) {
		apiKey := c.GetHeader("X-Api-Key")
		if apiKey == "" {
			apiKey = c.Query("api_key")
		}
		if apiKey == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "API key required (X-Api-Key header or api_key query param)"})
			c.Abort()
			return
		}

		keyHash := hashAPIKey(apiKey)
		cacheKey := "api_key:" + keyHash

		cachedSiteID, err := m.redis.Get(c.Request.Context(), cacheKey).Result()
		if err == nil && cachedSiteID != "" {
			site, siteErr := repo.GetSiteByID(c.Request.Context(), cachedSiteID)
			if siteErr == nil {
				_ = repo.TouchAPIKeyLastUsedByHash(c.Request.Context(), keyHash)
				c.Set("site_id", site.ID)
				c.Set("site", site)
				c.Next()
				return
			}
			m.redis.Del(c.Request.Context(), cacheKey)
		}

		site, err := repo.ValidateAPIKey(c.Request.Context(), apiKey)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid API key"})
			c.Abort()
			return
		}
		m.redis.Set(c.Request.Context(), cacheKey, site.ID, 5*time.Minute)

		c.Set("site_id", site.ID)
		c.Set("site", site)
		c.Next()
	}
}

// RateLimit enforces 100 requests/minute per site.
// Now returns Retry-After and X-RateLimit-* headers for proper client UX.
func (m *Middleware) RateLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		siteID := c.GetString("site_id")
		if siteID == "" {
			siteID = c.GetHeader("X-Site-ID")
		}
		if siteID == "" {
			siteID = "unknown"
		}

		const limit int64 = 100
		key := "rate:" + siteID + ":" + strconv.FormatInt(time.Now().Unix()/60, 10)
		count, err := m.redis.Incr(c.Request.Context(), key).Result()
		if err != nil {
			// Redis unavailable — fail open (don't block traffic)
			c.Next()
			return
		}

		if count == 1 {
			m.redis.Expire(c.Request.Context(), key, 60*time.Second)
		}

		remaining := limit - count
		if remaining < 0 {
			remaining = 0
		}
		c.Header("X-RateLimit-Limit", strconv.FormatInt(limit, 10))
		c.Header("X-RateLimit-Remaining", strconv.FormatInt(remaining, 10))

		if count > limit {
			retryAfter := int64(60 - (time.Now().Unix() % 60))
			c.Header("Retry-After", strconv.FormatInt(retryAfter, 10))
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error":       "Rate limit exceeded",
				"retry_after": retryAfter,
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// Metrics records HTTP request metrics via Prometheus.
func (m *Middleware) Metrics() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		duration := time.Since(start)
		status := strconv.Itoa(c.Writer.Status())
		observability.RecordRequest(c.Request.Method, c.FullPath(), status, duration)
	}
}

// Recovery handles panics and logs structured errors.
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

func hashAPIKey(apiKey string) string {
	hash := sha256.Sum256([]byte(apiKey))
	return hex.EncodeToString(hash[:])
}
