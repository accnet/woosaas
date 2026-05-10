package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/woosaas/api/internal/config"
	"github.com/woosaas/api/internal/database"
	"github.com/woosaas/api/internal/observability"
	"github.com/woosaas/api/internal/orders"
	"github.com/woosaas/api/internal/worker"
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
	w := worker.NewConsumer(redis, ch, orders.NewRepository(pg), &worker.Config{
		BatchSize:     cfg.WorkerBatchSize,
		FlushInterval: time.Duration(cfg.WorkerFlushInterval) * time.Second,
		MaxRetries:    cfg.WorkerMaxRetries,
	})

	// Start worker
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	log.Println("Starting event worker...")
	if err := w.Start(ctx); err != nil {
		log.Fatalf("Worker error: %v", err)
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

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down worker...")
	cancel()
	log.Println("Worker stopped")
}
