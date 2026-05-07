package api

import (
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/woosaas/api/internal/api/handlers"
	"github.com/woosaas/api/internal/api/middleware"
	"github.com/woosaas/api/internal/auth"
	"github.com/woosaas/api/internal/customer360"
	"github.com/woosaas/api/internal/export"
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
	redisClient *redis.Client
	collector   *ingest.Collector
	stats       *query.Stats
	bots        *query.Bots
	exports     *export.ExportService
	customers   *customer360.CustomerService
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
		redisClient: redisClient,
		collector:   ingest.NewCollector(redisClient),
		stats:       query.NewStats(ch),
		bots:        query.NewBots(ch),
		exports:     export.NewService(ch),
		customers:   customer360.NewService(ch),
		onlineUsers: realtime.NewOnlineUsers(redisClient),
	}
}

func (r *Router) Setup() *gin.Engine {
	r.registerHealthRoute()
	r.engine.Use(r.mw.CORS())

	v1 := r.engine.Group("/api/v1")
	r.registerCollectRoutes(v1)

	authHandler := handlers.NewAuthHandler(r.repo, r.jwtManager)
	r.registerAuthRoutes(v1, authHandler)
	r.registerDashboardRoutes(v1, authHandler)
	r.registerStatsRoutes(v1)

	return r.engine
}

func (r *Router) registerHealthRoute() {
	r.engine.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})
}

func (r *Router) registerCollectRoutes(v1 *gin.RouterGroup) {
	collect := v1.Group("/collect")
	collect.Use(r.mw.APIKeyAuth(r.repo))
	collect.Use(r.mw.RateLimit())
	{
		collectHandler := handlers.NewCollectHandler(r.collector, r.repo)
		collect.POST("", collectHandler.CollectEvent)
		collect.POST("/batch", collectHandler.CollectBatch)
		collect.GET("/verify", collectHandler.Verify)
	}
}

func (r *Router) registerAuthRoutes(v1 *gin.RouterGroup, authHandler *handlers.AuthHandler) {
	authGroup := v1.Group("/auth")
	{
		authGroup.POST("/register", authHandler.Register)
		authGroup.POST("/login", authHandler.Login)
	}
}

func (r *Router) registerDashboardRoutes(v1 *gin.RouterGroup, authHandler *handlers.AuthHandler) {
	dashboard := v1.Group("")
	dashboard.Use(r.mw.JWTAuth())
	{
		dashboard.GET("/me", authHandler.Me)

		sitesHandler := handlers.NewSitesHandler(r.repo, r.collector)
		dashboard.POST("/sites", sitesHandler.CreateSite)
		dashboard.GET("/sites", sitesHandler.GetSites)
		dashboard.GET("/sites/:site_id", sitesHandler.GetSite)
		dashboard.PUT("/sites/:site_id", sitesHandler.UpdateSite)
		dashboard.DELETE("/sites/:site_id", sitesHandler.DeleteSite)

		// API Keys
		dashboard.POST("/sites/:site_id/api-keys", sitesHandler.CreateAPIKey)
		dashboard.GET("/sites/:site_id/api-keys", sitesHandler.GetAPIKeys)
		dashboard.GET("/sites/:site_id/tracking-code", sitesHandler.GetTrackingCode)
		dashboard.GET("/sites/:site_id/members", sitesHandler.GetSiteMembers)
		dashboard.POST("/sites/:site_id/members", sitesHandler.AddSiteMember)
		dashboard.PUT("/sites/:site_id/members/:member_id", sitesHandler.UpdateSiteMember)
		dashboard.DELETE("/sites/:site_id/members/:member_id", sitesHandler.DeleteSiteMember)
		dashboard.POST("/sites/:site_id/debug-event", sitesHandler.SendDebugEvent)
	}
}

func (r *Router) registerStatsRoutes(v1 *gin.RouterGroup) {
	statsHandler := handlers.NewStatsHandler(r.stats, r.bots, r.onlineUsers, r.repo, r.redisClient, r.exports, r.customers)
	stats := v1.Group("/stats")
	stats.Use(r.mw.JWTAuth())
	{
		stats.GET("/overview", statsHandler.GetOverview)
		stats.GET("/trend", statsHandler.GetTrend)
		stats.GET("/sources", statsHandler.GetSources)
		stats.GET("/campaigns", statsHandler.GetCampaigns)
		stats.GET("/pages", statsHandler.GetPages)
		stats.GET("/products", statsHandler.GetProducts)
		stats.GET("/funnel", statsHandler.GetFunnel)
		stats.GET("/realtime", statsHandler.GetRealtime)
		stats.GET("/realtime/events", statsHandler.GetRealtimeEvents)
		stats.GET("/bots", statsHandler.GetBots)
		stats.GET("/health", statsHandler.GetHealth)
		stats.GET("/export", statsHandler.Export)
		stats.GET("/customers", statsHandler.GetCustomers)
		stats.GET("/customers/:client_id", statsHandler.GetCustomer)
	}
}
