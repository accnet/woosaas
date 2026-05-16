package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	appCrypto "github.com/accnet/woosaas/api/internal/crypto"
	"github.com/accnet/woosaas/api/internal/orders"
	"github.com/accnet/woosaas/api/internal/shopbase"
	"github.com/accnet/woosaas/api/internal/sites"
	"github.com/redis/go-redis/v9"
)

const (
	shopbaseWebhookStream   = "shopbase:webhook_events"
	shopbaseConsumerGroup   = "shopbase-workers"
	shopbaseBackfillLockTTL = 30 * time.Minute
)

// ShopBaseConsumer processes ShopBase webhook events and backfill jobs.
type ShopBaseConsumer struct {
	redis         *redis.Client
	siteRepo      *sites.Repository
	orderSvc      *orders.Service
	encryptionKey []byte
	stopCh        chan struct{}
	wg            sync.WaitGroup
}

// NewShopBaseConsumer creates a new ShopBaseConsumer.
func NewShopBaseConsumer(
	redis *redis.Client,
	siteRepo *sites.Repository,
	orderSvc *orders.Service,
	encryptionKey []byte,
) *ShopBaseConsumer {
	return &ShopBaseConsumer{
		redis:         redis,
		siteRepo:      siteRepo,
		orderSvc:      orderSvc,
		encryptionKey: encryptionKey,
		stopCh:        make(chan struct{}),
	}
}

// Start begins processing the ShopBase webhook event stream.
func (c *ShopBaseConsumer) Start(ctx context.Context) error {
	// Create consumer group if not exists
	_ = c.redis.XGroupCreateMkStream(ctx, shopbaseWebhookStream, shopbaseConsumerGroup, "0").Err()

	c.wg.Add(1)
	go c.runWebhookLoop(ctx)

	c.wg.Add(1)
	go c.runBackfillLoop(ctx)

	return nil
}

// Stop gracefully stops the consumer.
func (c *ShopBaseConsumer) Stop() {
	close(c.stopCh)
	c.wg.Wait()
}

// runWebhookLoop reads and processes ShopBase webhook events from Redis stream.
func (c *ShopBaseConsumer) runWebhookLoop(ctx context.Context) {
	defer c.wg.Done()

	consumerName := fmt.Sprintf("shopbase-worker-%d", time.Now().UnixNano())

	for {
		select {
		case <-c.stopCh:
			return
		default:
		}

		streams, err := c.redis.XReadGroup(ctx, &redis.XReadGroupArgs{
			Group:    shopbaseConsumerGroup,
			Consumer: consumerName,
			Streams:  []string{shopbaseWebhookStream, ">"},
			Count:    10,
			Block:    5 * time.Second,
		}).Result()

		if err != nil {
			if err != redis.Nil {
				log.Printf("[shopbase-consumer] XReadGroup error: %v", err)
			}
			continue
		}

		for _, stream := range streams {
			for _, msg := range stream.Messages {
				if err := c.processWebhookEvent(ctx, msg); err != nil {
					log.Printf("[shopbase-consumer] event processing error: %v", err)
				}
				// Acknowledge even on error to avoid replay storms
				_ = c.redis.XAck(ctx, shopbaseWebhookStream, shopbaseConsumerGroup, msg.ID).Err()
			}
		}
	}
}

// processWebhookEvent handles a single webhook event from the Redis stream.
func (c *ShopBaseConsumer) processWebhookEvent(ctx context.Context, msg redis.XMessage) error {
	siteID, _ := msg.Values["site_id"].(string)
	topic, _ := msg.Values["topic"].(string)
	payloadStr, _ := msg.Values["payload"].(string)

	if siteID == "" || topic == "" {
		return nil
	}

	switch {
	case strings.HasPrefix(topic, "orders/"):
		return c.handleOrderEvent(ctx, siteID, topic, []byte(payloadStr))

	case topic == "refunds/create" || strings.HasPrefix(topic, "fulfillments/"):
		return c.refreshOrderFromReference(ctx, siteID, topic, []byte(payloadStr))

	case topic == "shop/update":
		// Could update shop metadata — skip for V1
		return nil

	case topic == "app/uninstalled":
		return c.siteRepo.MarkShopBaseIntegrationDisconnected(ctx, siteID)

	default:
		return nil
	}
}

// handleOrderEvent maps a ShopBase order webhook payload to WooOrderInput and upserts it.
func (c *ShopBaseConsumer) handleOrderEvent(ctx context.Context, siteID, topic string, payload []byte) error {
	// For delete events, mark order as deleted
	if topic == "orders/delete" {
		var ref struct {
			ID int64 `json:"id"`
		}
		if err := json.Unmarshal(payload, &ref); err == nil && ref.ID != 0 {
			orderID := fmt.Sprintf("%d", ref.ID)
			return c.orderSvc.MarkOrderDeleted(ctx, siteID, "shopbase", orderID, time.Now().UTC())
		}
		return nil
	}

	var order shopbase.Order
	if err := json.Unmarshal(payload, &order); err != nil {
		return fmt.Errorf("unmarshal order: %w", err)
	}

	input := shopbase.MapOrderToInput(order, siteID)
	if err := c.orderSvc.UpsertOrderSnapshot(ctx, siteID, input, false); err != nil {
		return fmt.Errorf("upsert order %d: %w", order.OrderNumber, err)
	}

	return nil
}

func (c *ShopBaseConsumer) refreshOrderFromReference(ctx context.Context, siteID, topic string, payload []byte) error {
	orderID := orderIDFromPayload(payload)
	if orderID == 0 {
		return fmt.Errorf("%s payload missing order_id", topic)
	}

	client, err := c.buildClient(ctx, siteID)
	if err != nil {
		return err
	}
	order, err := client.GetOrder(ctx, fmt.Sprintf("%d", orderID))
	if err != nil {
		return fmt.Errorf("fetch order %d after %s: %w", orderID, topic, err)
	}

	input := shopbase.MapOrderToInput(*order, siteID)
	if err := c.orderSvc.UpsertOrderSnapshot(ctx, siteID, input, false); err != nil {
		return fmt.Errorf("upsert order %d after %s: %w", orderID, topic, err)
	}
	return nil
}

func orderIDFromPayload(payload []byte) int64 {
	var ref struct {
		OrderID int64 `json:"order_id"`
		Order   struct {
			ID int64 `json:"id"`
		} `json:"order"`
	}
	if err := json.Unmarshal(payload, &ref); err != nil {
		return 0
	}
	if ref.OrderID != 0 {
		return ref.OrderID
	}
	return ref.Order.ID
}

// runBackfillLoop periodically checks for sites that need order backfill.
func (c *ShopBaseConsumer) runBackfillLoop(ctx context.Context) {
	defer c.wg.Done()

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-c.stopCh:
			return
		case <-ticker.C:
			c.checkBackfillJobs(ctx)
		}
	}
}

// checkBackfillJobs finds sites with status='running' and runs their backfill.
func (c *ShopBaseConsumer) checkBackfillJobs(ctx context.Context) {
	siteIDs, err := c.siteRepo.GetShopBaseSiteIDs(ctx, "connected")
	if err != nil {
		return
	}

	for _, siteID := range siteIDs {
		state, err := c.siteRepo.GetShopBaseSyncState(ctx, siteID)
		if err != nil || state.Status != "running" {
			continue
		}
		go c.runBackfill(ctx, siteID)
	}
}

// runBackfill performs a full order backfill for a ShopBase site.
func (c *ShopBaseConsumer) runBackfill(ctx context.Context, siteID string) {
	lockKey := fmt.Sprintf("shopbase:backfill:lock:%s", siteID)

	// Distributed lock to prevent concurrent backfills
	acquired, err := c.redis.SetNX(ctx, lockKey, "1", shopbaseBackfillLockTTL).Result()
	if err != nil || !acquired {
		return
	}
	defer c.redis.Del(ctx, lockKey)

	client, err := c.buildClient(ctx, siteID)
	if err != nil {
		_ = c.siteRepo.MarkShopBaseSyncError(ctx, siteID, err)
		return
	}

	log.Printf("[shopbase-backfill] starting for site %s", siteID)

	// Get cursor from existing sync state
	state, _ := c.siteRepo.GetShopBaseSyncState(ctx, siteID)

	params := shopbase.ListParams{Limit: 50, Status: "any"}
	if state != nil && state.LastOrderUpdatedAt != nil {
		t := *state.LastOrderUpdatedAt
		params.UpdatedAtMin = &t
	}

	var lastOrderAt *time.Time
	page := 1
	totalUpserted := 0

	for {
		params.Page = page
		orders, err := client.ListOrders(ctx, params)
		if err != nil {
			_ = c.siteRepo.MarkShopBaseSyncError(ctx, siteID, fmt.Errorf("list orders page %d: %w", page, err))
			return
		}

		if len(orders) == 0 {
			break
		}

		for _, order := range orders {
			input := shopbase.MapOrderToInput(order, siteID)
			if err := c.orderSvc.UpsertOrderSnapshot(ctx, siteID, input, false); err != nil {
				log.Printf("[shopbase-backfill] upsert error site=%s order=%d: %v", siteID, order.OrderNumber, err)
				continue
			}
			totalUpserted++
			if order.UpdatedAt != nil {
				if lastOrderAt == nil || order.UpdatedAt.After(*lastOrderAt) {
					t := *order.UpdatedAt
					lastOrderAt = &t
				}
			}
		}

		// Refresh lock TTL
		_ = c.redis.Expire(ctx, lockKey, shopbaseBackfillLockTTL).Err()

		if len(orders) < params.Limit {
			break
		}
		page++
	}

	if err := c.siteRepo.MarkShopBaseBackfillComplete(ctx, siteID, lastOrderAt); err != nil {
		log.Printf("[shopbase-backfill] mark complete error site=%s: %v", siteID, err)
	}

	log.Printf("[shopbase-backfill] completed site=%s upserted=%d", siteID, totalUpserted)
}

// buildClient creates an authenticated ShopBase client for a site.
func (c *ShopBaseConsumer) buildClient(ctx context.Context, siteID string) (*shopbase.Client, error) {
	apiKeyEnc, apiPassEnc, _, err := c.siteRepo.GetSiteIntegrationCredentials(ctx, siteID, "shopbase")
	if err != nil {
		return nil, fmt.Errorf("get credentials: %w", err)
	}

	apiKey, err := appCrypto.Decrypt(apiKeyEnc, c.encryptionKey)
	if err != nil {
		return nil, fmt.Errorf("decrypt api key: %w", err)
	}
	apiPass, err := appCrypto.Decrypt(apiPassEnc, c.encryptionKey)
	if err != nil {
		return nil, fmt.Errorf("decrypt api password: %w", err)
	}

	integration, err := c.siteRepo.GetSiteIntegration(ctx, siteID, "shopbase")
	if err != nil {
		return nil, fmt.Errorf("get integration: %w", err)
	}

	return shopbase.NewClient(integration.ShopDomain, shopbase.Auth{
		APIKey:      apiKey,
		APIPassword: apiPass,
	}), nil
}
