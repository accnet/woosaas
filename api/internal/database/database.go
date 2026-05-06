package database

import (
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/woosaas/api/internal/config"
)

// NewPostgresDB wraps NewPostgres for backwards compatibility
func NewPostgresDB(cfg *config.Config) (*pgxpool.Pool, error) {
	return NewPostgres(cfg.ToPostgresConfig())
}

// NewClickHouseDB wraps NewClickHouse for backwards compatibility
func NewClickHouseDB(cfg *config.Config) (driver.Conn, error) {
	return NewClickHouse(cfg.ToClickHouseConfig())
}

// NewRedisDB wraps NewRedis for backwards compatibility
func NewRedisDB(cfg *config.Config) (*redis.Client, error) {
	return NewRedis(cfg.ToRedisConfig())
}