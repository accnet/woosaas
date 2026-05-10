package worker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/redis/go-redis/v9"
	"github.com/shopspring/decimal"
	"github.com/woosaas/api/internal/observability"
	"github.com/woosaas/api/internal/orders"
	"github.com/woosaas/api/pkg/models"
)

const (
	eventsStream     = "events:stream"
	deadStream       = "events:dead"
	ordersDeadStream = "orders:dead"
	consumerGroup    = "woosaas-workers"
)

type Config struct {
	BatchSize     int
	FlushInterval time.Duration
	MaxRetries    int
}

type Consumer struct {
	redis  *redis.Client
	ch     driver.Conn
	orders *orders.Service
	config *Config
	logger *observability.StructuredLogger
	mu     sync.Mutex
	stopCh chan struct{}
	wg     sync.WaitGroup
}

func NewConsumer(redis *redis.Client, ch driver.Conn, orderSvc *orders.Service, logger *observability.StructuredLogger, config *Config) *Consumer {
	if config.BatchSize == 0 {
		config.BatchSize = 1000
	}
	if config.FlushInterval == 0 {
		config.FlushInterval = 2 * time.Second
	}
	if config.MaxRetries == 0 {
		config.MaxRetries = 3
	}

	return &Consumer{
		redis:  redis,
		ch:     ch,
		orders: orderSvc,
		config: config,
		logger: logger,
		stopCh: make(chan struct{}),
	}
}

func (c *Consumer) Start(ctx context.Context) error {
	c.wg.Add(1)
	go c.run(ctx)
	return nil
}

func (c *Consumer) Stop() {
	close(c.stopCh)
	c.wg.Wait()
}

func (c *Consumer) run(ctx context.Context) {
	defer c.wg.Done()

	if err := c.ensureConsumerGroup(ctx); err != nil {
		c.logger.LogError(ctx, "init_consumer_group", err, nil)
		return
	}

	batch := &eventBatchWriter{
		events:  make([]queuedEvent, 0, c.config.BatchSize),
		maxSize: c.config.BatchSize,
		maxAge:  c.config.FlushInterval,
		redis:   c.redis,
		ch:      c.ch,
		logger:  c.logger,
	}

	ticker := time.NewTicker(c.config.FlushInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			if err := batch.flush(context.Background(), c.config.MaxRetries); err != nil {
				c.logger.LogError(context.Background(), "flush_on_shutdown", err, nil)
			}
			return
		case <-c.stopCh:
			if err := batch.flush(context.Background(), c.config.MaxRetries); err != nil {
				c.logger.LogError(context.Background(), "flush_on_shutdown", err, nil)
			}
			return
		case <-ticker.C:
			c.mu.Lock()
			if err := batch.flush(ctx, c.config.MaxRetries); err != nil {
				c.logger.LogError(ctx, "flush_batch", err, nil)
			}
			c.mu.Unlock()
		default:
			c.readOnce(ctx, batch)
		}
	}
}

func (c *Consumer) ensureConsumerGroup(ctx context.Context) error {
	err := c.redis.XGroupCreateMkStream(ctx, eventsStream, consumerGroup, "0").Err()
	if err != nil && !isBusyGroupErr(err) {
		return err
	}
	err = c.redis.XGroupCreateMkStream(ctx, orders.OrdersStream, consumerGroup, "0").Err()
	if err != nil && !isBusyGroupErr(err) {
		return err
	}
	return nil
}

func (c *Consumer) readOnce(ctx context.Context, batch *eventBatchWriter) {
	count := int64(c.config.BatchSize - len(batch.events))
	if count <= 0 {
		count = int64(c.config.BatchSize)
	}

	streams, err := c.redis.XReadGroup(ctx, &redis.XReadGroupArgs{
		Group:    consumerGroup,
		Consumer: consumerName(),
		Streams:  streamReadGroupArgs(),
		Count:    count,
		Block:    time.Second,
	}).Result()
	if errors.Is(err, redis.Nil) {
		return
	}
	if err != nil {
		c.logger.LogError(ctx, "read_stream", err, nil)
		return
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	for _, stream := range streams {
		for _, message := range stream.Messages {
			if stream.Stream == orders.OrdersStream {
				if err := c.processOrderMessage(ctx, message); err != nil {
					c.logger.LogError(ctx, "process_order", err, map[string]interface{}{"message_id": message.ID})
				}
				continue
			}
			event, err := parseMessage(message)
			if err != nil {
				c.logger.LogError(ctx, "parse_event", err, map[string]interface{}{"message_id": message.ID})
				_ = moveMessageToDead(ctx, c.redis, message, err, 0)
				continue
			}
			if batch.add(event) {
				if err := batch.flush(ctx, c.config.MaxRetries); err != nil {
					c.logger.LogError(ctx, "flush_batch", err, nil)
				}
			}
		}
	}
}

func (c *Consumer) processOrderMessage(ctx context.Context, message redis.XMessage) error {
	item, err := parseOrderMessage(message)
	if err != nil {
		return moveOrderMessageToDead(ctx, c.redis, message, err, 0)
	}

	if err := c.orders.UpsertOrderSnapshot(ctx, item.siteID, item.order, item.contactSyncEnabled); err != nil {
		_ = c.orders.MarkSyncError(ctx, item.siteID, item.contactSyncEnabled, err)
		attempts, retryErr := incrementRetryForStream(ctx, c.redis, orders.OrdersStream, message.ID)
		if retryErr != nil {
			return retryErr
		}
		if attempts >= c.config.MaxRetries {
			return moveOrderMessageToDead(ctx, c.redis, message, err, attempts)
		}
		return err
	}

	c.redis.Del(ctx, retryKeyForStream(orders.OrdersStream, message.ID))
	return c.redis.XAck(ctx, orders.OrdersStream, consumerGroup, message.ID).Err()
}

var (
	_consumerName     string
	_consumerNameOnce sync.Once
)

func consumerName() string {
	_consumerNameOnce.Do(func() {
		host, err := os.Hostname()
		if err != nil || host == "" {
			_consumerName = "worker"
		} else {
			_consumerName = host
		}
	})
	return _consumerName
}

func isBusyGroupErr(err error) bool {
	return err != nil && len(err.Error()) >= len("BUSYGROUP") && err.Error()[:len("BUSYGROUP")] == "BUSYGROUP"
}

func (c *Consumer) CleanupRealtime(ctx context.Context) error {
	pattern := "online:*"
	iter := c.redis.Scan(ctx, 0, pattern, 100).Iterator()
	cutoff := float64(time.Now().Add(-30 * time.Minute).Unix())

	for iter.Next(ctx) {
		key := iter.Val()
		c.redis.ZRemRangeByScore(ctx, key, "-inf", fmt.Sprintf("%f", cutoff))
	}

	return iter.Err()
}

type queuedEvent struct {
	messageID string
	message   redis.XMessage
	siteID    string
	event     models.Event
}

type eventBatchWriter struct {
	events  []queuedEvent
	maxSize int
	maxAge  time.Duration
	redis   *redis.Client
	ch      driver.Conn
	logger  *observability.StructuredLogger
}

func (b *eventBatchWriter) add(event queuedEvent) bool {
	b.events = append(b.events, event)
	return len(b.events) >= b.maxSize
}

func (b *eventBatchWriter) flush(ctx context.Context, maxRetries int) error {
	if len(b.events) == 0 {
		return nil
	}

	batch, err := b.ch.PrepareBatch(ctx, `
		INSERT INTO analytics_events (
			event_time, site_id, event_id, event_name, client_id, session_id, user_id,
			url, path, referrer, source, medium, campaign, term, content, gclid, fbclid,
			ttclid, msclkid, device_type, browser, os, country, city, ip_hash, user_agent,
			order_id, product_id, product_name, quantity, revenue, currency, items_json,
			properties_json, bot_score, bot_reason
		)
	`)
	if err != nil {
		return b.handleFlushError(ctx, err, maxRetries)
	}

	ids := make([]string, 0, len(b.events))
	for _, item := range b.events {
		event := normalizeEvent(item.event)
		attribution := event.Attribution
		if attribution == nil {
			attribution = &models.Attribution{}
		}
		propertiesJSON := marshalString(event.Properties)
		eventTime := parseEventTime(event.EventTime)

		if err := batch.Append(
			eventTime,
			item.siteID,
			event.EventID,
			event.EventName,
			event.ClientID,
			event.SessionID,
			event.UserID,
			event.URL,
			event.Path,
			event.Referrer,
			attribution.Source,
			attribution.Medium,
			attribution.Campaign,
			attribution.Term,
			attribution.Content,
			attribution.GCLID,
			attribution.FBCLID,
			attribution.TTCLID,
			attribution.MSCLKID,
			event.DeviceType,
			event.Browser,
			event.OS,
			event.Country,
			event.City,
			event.IPHash,
			event.UserAgent,
			event.OrderID,
			event.ProductID,
			event.ProductName,
			event.Quantity,
			decimal.NewFromFloat(event.Revenue),
			event.Currency,
			event.ItemsJSON,
			propertiesJSON,
			uint8(clamp(event.BotScore, 0, 255)),
			event.BotReason,
		); err != nil {
			return b.handleFlushError(ctx, err, maxRetries)
		}
		ids = append(ids, item.messageID)
	}

	if err := batch.Send(); err != nil {
		return b.handleFlushError(ctx, err, maxRetries)
	}

	if len(ids) > 0 {
		if err := b.redis.XAck(ctx, eventsStream, consumerGroup, ids...).Err(); err != nil {
			return err
		}
		observability.RecordEventProcessed(len(ids))
	}

	if size, err := b.redis.XLen(ctx, eventsStream).Result(); err == nil {
		observability.SetQueueSize(float64(size))
	}

	b.events = b.events[:0]
	return nil
}

func (b *eventBatchWriter) handleFlushError(ctx context.Context, cause error, maxRetries int) error {
	if maxRetries <= 0 {
		maxRetries = 1
	}

	kept := b.events[:0]
	for _, item := range b.events {
		attempts, err := incrementRetry(ctx, b.redis, item.messageID)
		if err != nil {
			b.logger.LogError(ctx, "increment_retry", err, map[string]interface{}{"message_id": item.messageID, "site_id": item.siteID, "event_id": item.event.EventID})
			kept = append(kept, item)
			continue
		}
		if attempts >= maxRetries {
			b.logger.LogEvent(ctx, "dead_letter", map[string]interface{}{"message_id": item.messageID, "site_id": item.siteID, "event_id": item.event.EventID, "attempts": attempts})
			if err := moveMessageToDead(ctx, b.redis, item.message, cause, attempts); err != nil {
				b.logger.LogError(ctx, "move_to_dead", err, map[string]interface{}{"message_id": item.messageID})
				kept = append(kept, item)
			}
			continue
		}
		kept = append(kept, item)
	}
	b.events = kept
	return cause
}

func parseMessage(message redis.XMessage) (queuedEvent, error) {
	siteID, ok := message.Values["site_id"].(string)
	if !ok || siteID == "" {
		return queuedEvent{}, fmt.Errorf("missing site_id")
	}

	eventJSON, ok := message.Values["event"].(string)
	if !ok || eventJSON == "" {
		return queuedEvent{}, fmt.Errorf("missing event payload")
	}

	var event models.Event
	if err := json.Unmarshal([]byte(eventJSON), &event); err != nil {
		return queuedEvent{}, err
	}

	return queuedEvent{
		messageID: message.ID,
		message:   message,
		siteID:    siteID,
		event:     event,
	}, nil
}

func incrementRetry(ctx context.Context, redisClient *redis.Client, messageID string) (int, error) {
	key := retryKeyForStream(eventsStream, messageID)
	attempts, err := redisClient.Incr(ctx, key).Result()
	if err != nil {
		return 0, err
	}
	redisClient.Expire(ctx, key, 24*time.Hour)
	return int(attempts), nil
}

func incrementRetryForStream(ctx context.Context, redisClient *redis.Client, stream, messageID string) (int, error) {
	key := retryKeyForStream(stream, messageID)
	attempts, err := redisClient.Incr(ctx, key).Result()
	if err != nil {
		return 0, err
	}
	redisClient.Expire(ctx, key, 24*time.Hour)
	return int(attempts), nil
}

func retryKeyForStream(stream, messageID string) string {
	return fmt.Sprintf("%s:retry:%s", stream, messageID)
}

func streamReadGroupArgs() []string {
	return []string{eventsStream, orders.OrdersStream, ">", ">"}
}

func moveMessageToDead(ctx context.Context, redisClient *redis.Client, message redis.XMessage, cause error, attempts int) error {
	values := map[string]interface{}{
		"source_stream": eventsStream,
		"source_id":     message.ID,
		"error":         cause.Error(),
		"attempts":      attempts,
		"dead_at":       time.Now().UTC().Format(time.RFC3339Nano),
	}
	for key, value := range message.Values {
		values[key] = value
	}
	if err := redisClient.XAdd(ctx, &redis.XAddArgs{
		Stream: deadStream,
		Values: values,
	}).Err(); err != nil {
		return err
	}
	if err := redisClient.XAck(ctx, eventsStream, consumerGroup, message.ID).Err(); err != nil {
		return err
	}
	redisClient.Del(ctx, retryKeyForStream(eventsStream, message.ID))
	return nil
}

type queuedOrder struct {
	messageID          string
	message            redis.XMessage
	siteID             string
	contactSyncEnabled bool
	order              models.WooOrderInput
}

func parseOrderMessage(message redis.XMessage) (queuedOrder, error) {
	siteID, ok := message.Values["site_id"].(string)
	if !ok || siteID == "" {
		return queuedOrder{}, fmt.Errorf("missing site_id")
	}
	orderJSON, ok := message.Values["order"].(string)
	if !ok || orderJSON == "" {
		return queuedOrder{}, fmt.Errorf("missing order payload")
	}
	contactSyncRaw, _ := message.Values["contact_sync_enabled"].(string)

	var order models.WooOrderInput
	if err := json.Unmarshal([]byte(orderJSON), &order); err != nil {
		return queuedOrder{}, err
	}

	return queuedOrder{
		messageID:          message.ID,
		message:            message,
		siteID:             siteID,
		contactSyncEnabled: strings.EqualFold(contactSyncRaw, "true"),
		order:              order,
	}, nil
}

func moveOrderMessageToDead(ctx context.Context, redisClient *redis.Client, message redis.XMessage, cause error, attempts int) error {
	values := map[string]interface{}{
		"source_stream": orders.OrdersStream,
		"source_id":     message.ID,
		"error":         cause.Error(),
		"attempts":      attempts,
		"dead_at":       time.Now().UTC().Format(time.RFC3339Nano),
	}
	for key, value := range message.Values {
		values[key] = value
	}
	if err := redisClient.XAdd(ctx, &redis.XAddArgs{
		Stream: ordersDeadStream,
		Values: values,
	}).Err(); err != nil {
		return err
	}
	if err := redisClient.XAck(ctx, orders.OrdersStream, consumerGroup, message.ID).Err(); err != nil {
		return err
	}
	redisClient.Del(ctx, retryKeyForStream(orders.OrdersStream, message.ID))
	return nil
}

func normalizeEvent(event models.Event) models.Event {
	if event.EventTime == "" {
		event.EventTime = time.Now().Format(time.RFC3339Nano)
	}
	if event.Properties == nil {
		return event
	}

	if event.OrderID == "" {
		event.OrderID = propertyString(event.Properties, "order_id")
	}
	if event.ProductID == "" {
		event.ProductID = propertyString(event.Properties, "product_id")
	}
	if event.ProductName == "" {
		event.ProductName = propertyString(event.Properties, "product_name")
	}
	if event.Quantity == 0 {
		event.Quantity = propertyUint32(event.Properties, "quantity")
	}
	if event.Revenue == 0 {
		event.Revenue = propertyFloat64(event.Properties, "revenue")
	}
	if event.Currency == "" {
		event.Currency = propertyString(event.Properties, "currency")
	}
	if event.ItemsJSON == "" {
		if items, ok := event.Properties["items"]; ok {
			event.ItemsJSON = marshalString(items)
		}
	}

	return event
}

func parseEventTime(value string) time.Time {
	if t, err := time.Parse(time.RFC3339Nano, value); err == nil {
		return t
	}
	if t, err := time.Parse("2006-01-02 15:04:05", value); err == nil {
		return t
	}
	return time.Now()
}

func marshalString(value interface{}) string {
	if value == nil {
		return ""
	}
	data, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	return string(data)
}

func propertyString(properties map[string]interface{}, key string) string {
	value, ok := properties[key]
	if !ok || value == nil {
		return ""
	}
	switch v := value.(type) {
	case string:
		return v
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case int:
		return strconv.Itoa(v)
	default:
		return fmt.Sprint(v)
	}
}

func propertyFloat64(properties map[string]interface{}, key string) float64 {
	value, ok := properties[key]
	if !ok || value == nil {
		return 0
	}
	switch v := value.(type) {
	case float64:
		return v
	case float32:
		return float64(v)
	case int:
		return float64(v)
	case int64:
		return float64(v)
	case json.Number:
		f, _ := v.Float64()
		return f
	case string:
		f, _ := strconv.ParseFloat(v, 64)
		return f
	default:
		return 0
	}
}

func propertyUint32(properties map[string]interface{}, key string) uint32 {
	value := propertyFloat64(properties, key)
	if value <= 0 {
		return 0
	}
	return uint32(value)
}

func clamp(value, min, max int) int {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}
