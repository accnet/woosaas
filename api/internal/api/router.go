package api

import (
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/woosaas/api/internal/api/handlers"
	"github.com/woosaas/api/internal/api/middleware"
	"github.com/woosaas/api/internal/auth"
	"github.com/woosaas/api/internal/ingest"
	"github.com/woosaas/api/internal/query"
	"github.com/woosaas/api/internal/realtime"
	"github.com/woosaas/api/internal/sites"
)

type Router struct {
	engine      *gin.Engine
	repo        *sites.Repository
	jwtManager  *auth.JWTManager
	mw          *middleware.Middleware
	collector   *ingest.Collector
	stats       *query.Stats
	onlineUsers *realtime.OnlineUsers
}

func NewRouter(
	repo *sites.Repository,
	jwtManager *auth.JWTManager,
	redisClient *redis.Client,
	ch driver.Conn,
) *Router {
	gin.SetMode(gin.ReleaseMode)

	engine := gin.New()
	engine.Use(gin.Recovery())
	engine.Use(gin.Logger())

	return &Router{
		engine:      engine,
		repo:        repo,
		jwtManager:  jwtManager,
		mw:          middleware.NewMiddleware(jwtManager, redisClient),
		collector:   ingest.NewCollector(redisClient),
		stats:       query.NewStats(ch),
		onlineUsers: realtime.NewOnlineUsers(redisClient),
	}
}

func (r *Router) Setup() *gin.Engine {
	// Health check
	r.engine.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// API v1
	v1 := r.engine.Group("/api/v1")

	// ===== COLLECT ENDPOINTS (API Key Auth, CORS) =====
	collect := v1.Group("/collect")
	collect.Use(r.mw.CORS())
	collect.Use(r.mw.APIKeyAuth(r.repo))
	collect.Use(r.mw.RateLimit())
	{
		collectHandler := handlers.NewCollectHandler(r.collector)
		collect.POST("", collectHandler.CollectEvent)
		collect.POST("/batch", collectHandler.CollectBatch)
		collect.GET("/verify", collectHandler.Verify)
	}

	// ===== PUBLIC AUTH ENDPOINTS =====
	authHandler := handlers.NewAuthHandler(r.repo, r.jwtManager)
	authGroup := v1.Group("/auth")
	{
		authGroup.POST("/register", authHandler.Register)
		authGroup.POST("/login", authHandler.Login)
	}

	// ===== PROTECTED DASHBOARD ENDPOINTS =====
	dashboard := v1.Group("")
	dashboard.Use(r.mw.JWTAuth())
	{
		// User
		dashboard.GET("/me", authHandler.Me)

		// Sites
		sitesHandler := handlers.NewSitesHandler(r.repo)
		dashboard.POST("/sites", sitesHandler.CreateSite)
		dashboard.GET("/sites", sitesHandler.GetSites)
		dashboard.GET("/sites/:site_id", sitesHandler.GetSite)
		dashboard.PUT("/sites/:site_id", sitesHandler.UpdateSite)
		dashboard.DELETE("/sites/:site_id", sitesHandler.DeleteSite)

		// API Keys
		dashboard.POST("/sites/:site_id/api-keys", sitesHandler.CreateAPIKey)
		dashboard.GET("/sites/:site_id/api-keys", sitesHandler.GetAPIKeys)
		dashboard.GET("/sites/:site_id/tracking-code", sitesHandler.GetTrackingCode)
	}

	// ===== STATS ENDPOINTS (JWT Auth) =====
	statsHandler := handlers.NewStatsHandler(r.stats, r.onlineUsers, r.repo)
	stats := v1.Group("/stats")
	stats.Use(r.mw.JWTAuth())
	{
		stats.GET("/overview", statsHandler.GetOverview)
		stats.GET("/trend", statsHandler.GetTrend)
		stats.GET("/sources", statsHandler.GetSources)
		stats.GET("/pages", statsHandler.GetPages)
		stats.GET("/products", statsHandler.GetProducts)
		stats.GET("/funnel", statsHandler.GetFunnel)
		stats.GET("/realtime", statsHandler.GetRealtime)
		stats.GET("/bots", statsHandler.GetBots)
	}

	return r.engine
}
