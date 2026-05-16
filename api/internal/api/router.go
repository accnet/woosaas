package api

import (
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/accnet/woosaas/api/internal/analytics"
	"github.com/accnet/woosaas/api/internal/api/handlers"
	"github.com/accnet/woosaas/api/internal/api/middleware"
	"github.com/accnet/woosaas/api/internal/auth"
	"github.com/accnet/woosaas/api/internal/config"
	"github.com/accnet/woosaas/api/internal/customers"
	"github.com/accnet/woosaas/api/internal/export"
	"github.com/accnet/woosaas/api/internal/ingest"
	"github.com/accnet/woosaas/api/internal/orders"
	"github.com/accnet/woosaas/api/internal/realtime"
	appsettings "github.com/accnet/woosaas/api/internal/settings"
	"github.com/accnet/woosaas/api/internal/sites"
	"github.com/accnet/woosaas/api/internal/users"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type Router struct {
	engine          *gin.Engine
	repo            *sites.Repository
	authSvc         *auth.Service
	mw              *middleware.Middleware
	redisClient     *redis.Client
	collector       *ingest.Collector
	orderSvc        *orders.Service
	settingsRepo    *appsettings.Repository
	templateRepo    *export.TemplateRepository
	stats           *analytics.Stats
	bots            *analytics.Bots
	exports         *export.ExportService
	customers       *customers.CustomerService
	onlineUsers     *realtime.OnlineUsers
	shopbaseHandler *handlers.ShopBaseHandler
	shopbaseWebhook *handlers.ShopBaseWebhookHandler
}

func NewRouter(
	pg *pgxpool.Pool,
	repo *sites.Repository,
	jwtManager *auth.JWTManager,
	redisClient *redis.Client,
	ch driver.Conn,
	allowedOrigins []string,
	cfg *config.Config,
) *Router {
	gin.SetMode(gin.ReleaseMode)

	engine := gin.New()
	engine.Use(gin.Recovery())
	engine.Use(gin.Logger())

	// M2: gzip compression via native compress/gzip
	engine.Use(gzipMiddleware())

	userRepo := users.NewRepository(pg)
	orderQueue := orders.NewQueue(redisClient)
	orderRepo := orders.NewRepository(pg)

	encKey, _ := handlers.LoadEncryptionKey(cfg.IntegrationEncryptionKey)

	return &Router{
		engine:  engine,
		repo:    repo,
		authSvc: auth.NewService(userRepo, jwtManager),
		// M3: pass allowed origins for proper CORS validation
		mw:              middleware.NewMiddleware(jwtManager, redisClient, allowedOrigins),
		redisClient:     redisClient,
		collector:       ingest.NewCollector(redisClient),
		orderSvc:        orders.NewService(orderQueue, orderRepo),
		settingsRepo:    appsettings.NewRepository(pg),
		templateRepo:    export.NewTemplateRepository(pg),
		stats:           analytics.NewStatsWithCache(ch, redisClient),
		bots:            analytics.NewBots(ch),
		exports:         export.NewService(ch),
		customers:       customers.NewService(ch),
		onlineUsers:     realtime.NewOnlineUsers(redisClient),
		shopbaseHandler: handlers.NewShopBaseHandler(repo, encKey, cfg.TrackerBaseURL, cfg.APIBaseURL),
		shopbaseWebhook: handlers.NewShopBaseWebhookHandler(repo, redisClient, encKey),
	}
}

func (r *Router) Setup() *gin.Engine {
	r.registerHealthRoute()
	r.engine.Use(r.mw.CORS())

	v1 := r.engine.Group("/api/v1")
	r.registerCollectRoutes(v1)
	r.registerWooSyncRoutes(v1)
	r.registerShopBaseWebhookRoutes(v1)

	authHandler := handlers.NewAuthHandler(r.authSvc)
	r.registerAuthRoutes(v1, authHandler)
	r.registerDashboardRoutes(v1, authHandler)
	r.registerStatsRoutes(v1)
	r.registerOrdersRoutes(v1)
	r.registerShopBaseRoutes(v1)

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

func (r *Router) registerWooSyncRoutes(v1 *gin.RouterGroup) {
	woo := v1.Group("/woo/orders")
	woo.Use(r.mw.APIKeyAuth(r.repo))
	woo.Use(r.mw.RateLimit())
	{
		ordersHandler := handlers.NewOrdersHandler(r.orderSvc, r.repo, r.redisClient, r.templateRepo)
		woo.POST("/sync", ordersHandler.SyncOrders)
		woo.POST("/backfill-state", ordersHandler.UpdateBackfillState)
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
		dashboard.PUT("/me", authHandler.UpdateProfile)
		dashboard.PUT("/me/password", authHandler.ChangePassword)

		sitesHandler := handlers.NewSitesHandler(r.repo, r.collector, r.templateRepo)
		ordersHandler := handlers.NewOrdersHandler(r.orderSvc, r.repo, r.redisClient, r.templateRepo)
		settingsHandler := handlers.NewSettingsHandler(r.settingsRepo)
		dashboard.GET("/settings", settingsHandler.GetUserSettings)
		dashboard.PUT("/settings", settingsHandler.UpdateUserSettings)
		dashboard.GET("/billing/profile", settingsHandler.GetBillingProfile)
		dashboard.PUT("/billing/profile", settingsHandler.UpdateBillingProfile)
		dashboard.GET("/billing/invoices", settingsHandler.ListInvoices)
		dashboard.POST("/sites", sitesHandler.CreateSite)
		dashboard.GET("/sites", sitesHandler.GetSites)
		dashboard.GET("/sites/:site_id", sitesHandler.GetSite)
		dashboard.PUT("/sites/:site_id", sitesHandler.UpdateSite)
		dashboard.DELETE("/sites/:site_id", sitesHandler.DeleteSite)

		// API Keys
		dashboard.POST("/sites/:site_id/api-keys", sitesHandler.CreateAPIKey)
		dashboard.GET("/sites/:site_id/api-keys", sitesHandler.GetAPIKeys)
		dashboard.DELETE("/sites/:site_id/api-keys/:key_id", sitesHandler.DeleteAPIKey)
		dashboard.GET("/sites/:site_id/tracking-code", sitesHandler.GetTrackingCode)
		dashboard.GET("/sites/:site_id/members", sitesHandler.GetSiteMembers)
		dashboard.POST("/sites/:site_id/members", sitesHandler.AddSiteMember)
		dashboard.PUT("/sites/:site_id/members/:member_id", sitesHandler.UpdateSiteMember)
		dashboard.DELETE("/sites/:site_id/members/:member_id", sitesHandler.DeleteSiteMember)
		dashboard.POST("/sites/:site_id/debug-event", sitesHandler.SendDebugEvent)
		dashboard.GET("/sites/:site_id/orders/sync-state", ordersHandler.GetSyncState)

		// Export templates (shared across sites)
		templateHandler := handlers.NewExportTemplatesHandler(r.templateRepo)
		dashboard.GET("/export/columns", templateHandler.ListColumns)
		dashboard.GET("/export-templates", templateHandler.List)
		dashboard.GET("/export-templates/:id", templateHandler.Get)
		dashboard.POST("/export-templates", templateHandler.Create)
		dashboard.PUT("/export-templates/:id", templateHandler.Update)
		dashboard.DELETE("/export-templates/:id", templateHandler.Delete)
		dashboard.POST("/export-templates/:id/set-default", templateHandler.SetDefault)
		dashboard.POST("/export-templates/:id/duplicate", templateHandler.Duplicate)

		// Backward-compatible site-scoped aliases.
		dashboard.GET("/sites/:site_id/export-templates", templateHandler.List)
		dashboard.GET("/sites/:site_id/export-templates/:id", templateHandler.Get)
		dashboard.POST("/sites/:site_id/export-templates", templateHandler.Create)
		dashboard.PUT("/sites/:site_id/export-templates/:id", templateHandler.Update)
		dashboard.DELETE("/sites/:site_id/export-templates/:id", templateHandler.Delete)
		dashboard.POST("/sites/:site_id/export-templates/:id/set-default", templateHandler.SetDefault)
		dashboard.POST("/sites/:site_id/export-templates/:id/duplicate", templateHandler.Duplicate)
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
		stats.GET("/devices", statsHandler.GetDeviceStats)
		stats.GET("/geo", statsHandler.GetGeoStats)
		stats.GET("/abandonment", statsHandler.GetAbandonmentStats)
		stats.GET("/heatmap", statsHandler.GetHeatmapStats)
		stats.GET("/channels", statsHandler.GetChannelStats)
	}
}

func (r *Router) registerOrdersRoutes(v1 *gin.RouterGroup) {
	ordersHandler := handlers.NewOrdersHandler(r.orderSvc, r.repo, r.redisClient, r.templateRepo)
	orders := v1.Group("")
	orders.Use(r.mw.JWTAuth())
	{
		orders.GET("/orders", ordersHandler.ListOrders)
		orders.GET("/orders/export", ordersHandler.ExportOrdersCSV)
		orders.GET("/orders/retention", ordersHandler.GetRetentionCohort)
		orders.GET("/orders/refunds", ordersHandler.GetRefundStats)
		orders.GET("/orders/cross-sell", ordersHandler.GetCrossSell)
		orders.GET("/orders/:woo_order_id", ordersHandler.GetOrderDetail)
		orders.GET("/contacts", ordersHandler.ListContacts)
	}
}

// registerShopBaseWebhookRoutes registers the public (no JWT) webhook receiver.
func (r *Router) registerShopBaseWebhookRoutes(v1 *gin.RouterGroup) {
	v1.POST("/shopbase/webhooks/:site_id", r.shopbaseWebhook.Receive)
}

// registerShopBaseRoutes registers authenticated ShopBase management endpoints.
func (r *Router) registerShopBaseRoutes(v1 *gin.RouterGroup) {
	sb := v1.Group("")
	sb.Use(r.mw.JWTAuth())
	{
		// Site creation & verification
		sb.POST("/sites/shopbase/verify", r.shopbaseHandler.VerifyStore)
		sb.POST("/sites/shopbase", r.shopbaseHandler.ConnectSite)

		// Per-site integration management
		sb.GET("/sites/:site_id/integration", r.shopbaseHandler.GetIntegration)
		sb.GET("/sites/:site_id/integration/shopbase/sync-state", r.shopbaseHandler.GetSyncState)
		sb.POST("/sites/:site_id/integration/shopbase/install-script", r.shopbaseHandler.InstallScript)
		sb.POST("/sites/:site_id/integration/shopbase/register-webhooks", r.shopbaseHandler.RegisterWebhooks)
		sb.POST("/sites/:site_id/integration/shopbase/backfill", r.shopbaseHandler.StartBackfill)
	}
}
