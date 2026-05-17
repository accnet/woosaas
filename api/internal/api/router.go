package api

import (
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/accnet/woosaas/api/internal/analytics"
	"github.com/accnet/woosaas/api/internal/api/handlers"
	"github.com/accnet/woosaas/api/internal/api/middleware"
	"github.com/accnet/woosaas/api/internal/auth"
	"github.com/accnet/woosaas/api/internal/billing"
	"github.com/accnet/woosaas/api/internal/config"
	"github.com/accnet/woosaas/api/internal/customers"
	"github.com/accnet/woosaas/api/internal/export"
	"github.com/accnet/woosaas/api/internal/ingest"
	"github.com/accnet/woosaas/api/internal/observability"
	"github.com/accnet/woosaas/api/internal/orders"
	"github.com/accnet/woosaas/api/internal/realtime"
	appsettings "github.com/accnet/woosaas/api/internal/settings"
	"github.com/accnet/woosaas/api/internal/shipment_tracking"
	"github.com/accnet/woosaas/api/internal/sites"
	"github.com/accnet/woosaas/api/internal/users"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type Router struct {
	engine           *gin.Engine
	pg               *pgxpool.Pool
	repo             *sites.Repository
	ch               driver.Conn
	jwtManager       *auth.JWTManager
	authSvc          *auth.Service
	mw               *middleware.Middleware
	redisClient      *redis.Client
	collector        *ingest.Collector
	orderSvc         *orders.Service
	settingsRepo     *appsettings.Repository
	templateRepo     *export.TemplateRepository
	stats            *analytics.Stats
	bots             *analytics.Bots
	exports          *export.ExportService
	customers        *customers.CustomerService
	onlineUsers      *realtime.OnlineUsers
	shopbaseHandler  *handlers.ShopBaseHandler
	shopbaseWebhook  *handlers.ShopBaseWebhookHandler
	shipmentTracking *handlers.ShipmentTrackingHandler
	billingSvc       *billing.BillingService
	encryptionKey    []byte
	apiBaseURL       string
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
	shipmentRepo := shipment_tracking.NewRepository(pg)
	billingSvc := billing.NewBillingServiceWithDB(pg)

	encKey, _ := handlers.LoadEncryptionKey(cfg.IntegrationEncryptionKey)

	return &Router{
		engine:     engine,
		pg:         pg,
		repo:       repo,
		ch:         ch,
		jwtManager: jwtManager,
		authSvc:    auth.NewService(userRepo, jwtManager),
		// M3: pass allowed origins for proper CORS validation
		mw:              middleware.NewMiddleware(jwtManager, userRepo, redisClient, allowedOrigins),
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
		shipmentTracking: handlers.NewShipmentTrackingHandler(
			shipment_tracking.NewService(shipmentRepo, repo, encKey),
			repo,
			redisClient,
			billingSvc,
		),
		billingSvc:    billingSvc,
		encryptionKey: encKey,
		apiBaseURL:    cfg.APIBaseURL,
	}
}

func (r *Router) Setup() *gin.Engine {
	r.registerHealthRoute()
	r.engine.Use(r.mw.CORS())

	v1 := r.engine.Group("/api/v1")
	r.registerCollectRoutes(v1)
	r.registerWooSyncRoutes(v1)
	r.registerShipmentTrackingPluginRoutes(v1)
	r.registerTrackingProviderWebhookRoutes(v1)
	r.registerShopBaseWebhookRoutes(v1)
	r.registerPlatformAdminRoutes()

	authHandler := handlers.NewAuthHandler(r.authSvc)
	r.registerAuthRoutes(v1, authHandler)
	r.registerDashboardRoutes(v1, authHandler)
	r.registerStatsRoutes(v1)
	r.registerOrdersRoutes(v1)
	r.registerShipmentTrackingRoutes(v1)
	r.registerShopBaseRoutes(v1)

	return r.engine
}

func (r *Router) registerPlatformAdminRoutes() {
	adminHandler := handlers.NewPlatformAdminHandler(r.pg, r.jwtManager, r.encryptionKey, r.apiBaseURL)
	admin := r.engine.Group("/api/admin/v1")
	admin.POST("/auth/login", adminHandler.Login)
	protected := admin.Group("")
	protected.Use(adminHandler.AuthRequired())
	{
		protected.GET("/me", adminHandler.Me)
		protected.GET("/users", adminHandler.ListUsers)
		protected.PUT("/users/:user_id/status", adminHandler.UpdateUserStatus)
		protected.PUT("/users/:user_id/plan", adminHandler.UpdateUserPlan)
		protected.GET("/plans", adminHandler.ListPlans)
		protected.PUT("/plans/:plan_id", adminHandler.UpdatePlan)
		protected.GET("/audit-logs", adminHandler.ListAuditLogs)
		protected.GET("/tracking-providers", adminHandler.ListTrackingProviders)
		protected.PUT("/tracking-providers/:provider_id", adminHandler.UpdateTrackingProvider)
		protected.GET("/system-settings/smtp", adminHandler.GetSMTPSettings)
		protected.PUT("/system-settings/smtp", adminHandler.UpdateSMTPSettings)
		protected.POST("/impersonation", adminHandler.StartImpersonation)
		protected.DELETE("/impersonation/:session_id", adminHandler.EndImpersonation)
	}
}

func (r *Router) registerShipmentTrackingPluginRoutes(v1 *gin.RouterGroup) {
	tracking := v1.Group("/shipment-tracking")
	tracking.Use(r.mw.APIKeyAuth(r.repo))
	tracking.Use(r.mw.RateLimit())
	{
		tracking.POST("/wc-push-config", r.shipmentTracking.SaveWCPushConfig)
	}
}

func (r *Router) registerTrackingProviderWebhookRoutes(v1 *gin.RouterGroup) {
	v1.POST("/shipment-tracking/webhooks/trackingmore", r.shipmentTracking.TrackingMoreWebhook)
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
		collectHandler := handlers.NewCollectHandler(r.collector, r.repo, r.redisClient, r.billingSvc)
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

		siteDataSvc := sites.NewSiteDataService(r.repo, r.ch, observability.NewStructuredLogger())
		sitesHandler := handlers.NewSitesHandler(r.repo, r.collector, r.templateRepo, siteDataSvc)
		ordersHandler := handlers.NewOrdersHandler(r.orderSvc, r.repo, r.redisClient, r.templateRepo)
		settingsHandler := handlers.NewSettingsHandler(r.settingsRepo)
		billingHandler := handlers.NewBillingHandler(r.pg, r.redisClient, r.billingSvc)
		dashboard.GET("/settings", settingsHandler.GetUserSettings)
		dashboard.PUT("/settings", settingsHandler.UpdateUserSettings)
		dashboard.GET("/billing/profile", settingsHandler.GetBillingProfile)
		dashboard.PUT("/billing/profile", settingsHandler.UpdateBillingProfile)
		dashboard.GET("/billing/invoices", settingsHandler.ListInvoices)
		dashboard.GET("/billing/usage", billingHandler.Usage)
		dashboard.GET("/billing/plans", billingHandler.Plans)
		dashboard.POST("/sites", sitesHandler.CreateSite)
		dashboard.GET("/sites", sitesHandler.GetSites)
		dashboard.GET("/sites/:site_id", sitesHandler.GetSite)
		dashboard.PUT("/sites/:site_id", sitesHandler.UpdateSite)
		dashboard.DELETE("/sites/:site_id", sitesHandler.DeleteSite)
		dashboard.POST("/sites/:site_id/reset-data", sitesHandler.ResetSiteData)

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
	features := middleware.NewFeatureMiddleware(r.billingSvc)
	stats := v1.Group("/stats")
	stats.Use(r.mw.JWTAuth())
	{
		stats.GET("/overview", features.RequireFeature("basic_analytics"), statsHandler.GetOverview)
		stats.GET("/trend", features.RequireFeature("basic_analytics"), statsHandler.GetTrend)
		stats.GET("/sources", features.RequireFeature("basic_analytics"), statsHandler.GetSources)
		stats.GET("/campaigns", features.RequireFeature("all_analytics"), statsHandler.GetCampaigns)
		stats.GET("/pages", features.RequireFeature("all_analytics"), statsHandler.GetPages)
		stats.GET("/products", features.RequireFeature("all_analytics"), statsHandler.GetProducts)
		stats.GET("/funnel", features.RequireFeature("all_analytics"), statsHandler.GetFunnel)
		stats.GET("/realtime", features.RequireFeature("realtime"), statsHandler.GetRealtime)
		stats.GET("/realtime/events", features.RequireFeature("realtime"), statsHandler.GetRealtimeEvents)
		stats.GET("/bots", features.RequireFeature("all_analytics"), statsHandler.GetBots)
		stats.GET("/health", features.RequireFeature("all_analytics"), statsHandler.GetHealth)
		stats.GET("/export", features.RequireFeature("api_access"), statsHandler.Export)
		stats.GET("/customers", features.RequireFeature("all_analytics"), statsHandler.GetCustomers)
		stats.GET("/customers/:client_id", features.RequireFeature("all_analytics"), statsHandler.GetCustomer)
		stats.GET("/devices", features.RequireFeature("all_analytics"), statsHandler.GetDeviceStats)
		stats.GET("/geo", features.RequireFeature("all_analytics"), statsHandler.GetGeoStats)
		stats.GET("/abandonment", features.RequireFeature("all_analytics"), statsHandler.GetAbandonmentStats)
		stats.GET("/heatmap", features.RequireFeature("all_analytics"), statsHandler.GetHeatmapStats)
		stats.GET("/channels", features.RequireFeature("all_analytics"), statsHandler.GetChannelStats)
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

func (r *Router) registerShipmentTrackingRoutes(v1 *gin.RouterGroup) {
	tracking := v1.Group("")
	tracking.Use(r.mw.JWTAuth())
	{
		tracking.GET("/sites/:site_id/orders/:woo_order_id/trackings", r.shipmentTracking.List)
		tracking.POST("/sites/:site_id/orders/:woo_order_id/trackings", r.shipmentTracking.Add)
		tracking.POST("/sites/:site_id/trackings/batch", r.shipmentTracking.AddBatch)
		tracking.POST("/sites/:site_id/orders/:woo_order_id/trackings/:tracking_id/refresh", r.shipmentTracking.Refresh)
		tracking.DELETE("/sites/:site_id/orders/:woo_order_id/trackings/:tracking_id", r.shipmentTracking.Delete)
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
