package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/accnet/woosaas/api/internal/api/handlers"
	"github.com/accnet/woosaas/api/internal/config"
	"github.com/accnet/woosaas/api/internal/database"
	"github.com/accnet/woosaas/api/internal/ingest"
	"github.com/accnet/woosaas/api/internal/observability"
	"github.com/accnet/woosaas/api/internal/orders"
	"github.com/accnet/woosaas/api/internal/sites"
	"github.com/accnet/woosaas/api/internal/worker"
)

func main() {
	// Load config
	cfg := config.Load()

	// Initialize logger
	logger := observability.NewStructuredLogger()

	// Connect to databases
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

	// Initialize worker
	orderSvc := orders.NewService(orders.NewQueue(redis), orders.NewRepository(pg))
	collector := ingest.NewCollector(redis)
	siteRepo := sites.NewRepository(pg)

	encKey, err := handlers.LoadEncryptionKey(cfg.IntegrationEncryptionKey)
	if err != nil {
		log.Fatalf("Invalid INTEGRATION_ENCRYPTION_KEY: %v", err)
	}

	w := worker.NewConsumer(redis, ch, orderSvc, collector, logger, &worker.Config{
		BatchSize:     cfg.WorkerBatchSize,
		FlushInterval: cfg.WorkerFlushInterval,
		MaxRetries:    cfg.WorkerMaxRetries,
	})

	sbConsumer := worker.NewShopBaseConsumer(redis, siteRepo, orderSvc, encKey)

	// Start worker
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	log.Println("Starting event worker...")
	if err := w.Start(ctx); err != nil {
		log.Fatalf("Worker error: %v", err)
	}

	log.Println("Starting ShopBase consumer...")
	if err := sbConsumer.Start(ctx); err != nil {
		log.Fatalf("ShopBase consumer error: %v", err)
	}

	// Also start realtime cleanup ticker
	go func() {
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if err := w.CleanupRealtime(ctx); err != nil {
					logger.LogError(ctx, "realtime_cleanup", err, nil)
				}
			}
		}
	}()

	go func() {
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				_, err := pg.Exec(ctx, `
					UPDATE subscriptions
					SET status = 'past_due', updated_at = NOW()
					WHERE status = 'active'
					  AND current_period_end IS NOT NULL
					  AND current_period_end < NOW() - INTERVAL '7 days'
				`)
				if err != nil {
					logger.LogError(ctx, "subscription_expiry", err, nil)
				}
			}
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down worker...")
	cancel()
	sbConsumer.Stop()
	log.Println("Worker stopped")
}
