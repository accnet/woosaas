package orders

import (
	"context"
	"encoding/json"

	"github.com/redis/go-redis/v9"
	"github.com/accnet/woosaas/api/pkg/models"
)

const OrdersStream = "orders:stream"

type Queue struct {
	redis *redis.Client
}

func NewQueue(redisClient *redis.Client) *Queue {
	return &Queue{redis: redisClient}
}

func (q *Queue) Enqueue(ctx context.Context, siteID string, order models.WooOrderInput, contactSyncEnabled bool) error {
	payload, err := json.Marshal(order)
	if err != nil {
		return err
	}
	_, err = q.redis.XAdd(ctx, &redis.XAddArgs{
		Stream: OrdersStream,
		Values: map[string]interface{}{
			"site_id":              siteID,
			"contact_sync_enabled": boolString(contactSyncEnabled),
			"order":                string(payload),
		},
	}).Result()
	return err
}

func boolString(value bool) string {
	if value {
		return "true"
	}
	return "false"
}
