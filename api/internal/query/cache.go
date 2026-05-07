package query

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// statsCache wraps Redis to provide a simple read-through cache for ClickHouse stats queries.
type statsCache struct {
	redis *redis.Client
}

func newStatsCache(r *redis.Client) *statsCache {
	return &statsCache{redis: r}
}

func (c *statsCache) get(ctx context.Context, key string, dest interface{}) bool {
	if c == nil || c.redis == nil {
		return false
	}
	data, err := c.redis.Get(ctx, key).Bytes()
	if err != nil {
		return false
	}
	return json.Unmarshal(data, dest) == nil
}

func (c *statsCache) set(ctx context.Context, key string, value interface{}, ttl time.Duration) {
	if c == nil || c.redis == nil {
		return
	}
	data, err := json.Marshal(value)
	if err != nil {
		return
	}
	c.redis.Set(ctx, key, data, ttl)
}

// cacheKey builds a namespaced Redis key for stats results.
func cacheKey(endpoint, siteID, from, to string, extra ...string) string {
	key := fmt.Sprintf("stats:%s:%s:%s:%s", endpoint, siteID, from, to)
	for _, e := range extra {
		key += ":" + e
	}
	return key
}
