package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/woosaas/api/internal/api"
	"github.com/woosaas/api/internal/auth"
	"github.com/woosaas/api/internal/config"
	"github.com/woosaas/api/internal/database"
	"github.com/woosaas/api/internal/observability"
	"github.com/woosaas/api/internal/sites"
)

func main() {
	cfg := config.Load()
	logger := observability.NewStructuredLogger()

	pg, err := database.NewPostgresDB(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to PostgreSQL: %v", err)
	}
	defer pg.Close()

	ch, err := database.NewClickHouseDB(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to ClickHouse: %v", err)
	}
	defer ch.Close()

	redis, err := database.NewRedisDB(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	defer redis.Close()

	repo := sites.NewRepository(pg)
	jwtManager := auth.NewJWTManager(cfg.JWTSecret, cfg.JWTExpiry)

	router := api.NewRouter(repo, jwtManager, redis, ch)
	engine := router.Setup()

	engine.GET("/metrics", observability.Metrics())
	engine.Use(observability.RequestLogger())
	engine.Use(observability.Recovery(logger))

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      engine,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("Server starting on port %s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited")
}
