package ingest

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/accnet/woosaas/api/internal/bot"
	"github.com/accnet/woosaas/api/internal/observability"
	"github.com/accnet/woosaas/api/pkg/models"
	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	"github.com/mssola/useragent"
	"github.com/redis/go-redis/v9"
)

// ipHashSalt is loaded once from env to avoid hardcoded secrets.
var (
	_ipSalt     string
	_ipSaltOnce sync.Once
)

func ipSalt() string {
	_ipSaltOnce.Do(func() {
		if s := os.Getenv("IP_HASH_SALT"); s != "" {
			_ipSalt = s
		} else {
			_ipSalt = "woosaas-salt-default"
		}
	})
	return _ipSalt
}

type Collector struct {
	redis     *redis.Client
	validator *validator.Validate
	scorer    *bot.Scorer
}

type RequestMetadata struct {
	ClientIP string
	IPHash   string
	Country  string
	City     string
}

func NewCollector(redisClient *redis.Client) *Collector {
	v := validator.New()
	return &Collector{
		redis:     redisClient,
		validator: v,
		scorer:    bot.NewScorer(redisClient),
	}
}

func (c *Collector) ValidateEvent(event *models.Event) error {
	if err := c.validator.Struct(event); err != nil {
		return err
	}
	return validateEventSemantics(event)
}

// CollectEvent processes and queues a single event
func (c *Collector) CollectEvent(ctx context.Context, siteID string, event *models.Event, meta RequestMetadata) error {
	if event.EventID == "" {
		event.EventID = uuid.New().String()
	}

	// Validate event
	if err := c.validator.Struct(event); err != nil {
		observability.RecordEventFailure()
		return fmt.Errorf("validation error: %w", err)
	}

	c.enrichEvent(event, meta)
	c.scoreBot(ctx, event, meta.ClientIP)

	// Serialize event
	eventJSON, err := json.Marshal(event)
	if err != nil {
		observability.RecordEventFailure()
		return fmt.Errorf("failed to marshal event: %w", err)
	}

	// Push to Redis Stream
	streamKey := "events:stream"

	_, err = c.redis.XAdd(ctx, &redis.XAddArgs{
		Stream: streamKey,
		Values: map[string]interface{}{
			"site_id":   siteID,
			"event":     string(eventJSON),
			"timestamp": time.Now().UnixMilli(),
		},
	}).Result()

	if err != nil {
		observability.RecordEventFailure()
		return fmt.Errorf("failed to push to stream: %w", err)
	}
	observability.RecordEventReceived(1)

	// Update realtime tracking
	c.updateRealtime(ctx, siteID, event)

	return nil
}

// CollectBatch processes and queues multiple events
func (c *Collector) CollectBatch(ctx context.Context, siteID string, events []models.Event, meta RequestMetadata) ([]models.EventResponse, error) {
	responses := make([]models.EventResponse, 0, len(events))
	now := time.Now()

	for i := range events {
		event := &events[i]

		// Validate event
		if err := c.validator.Struct(event); err != nil {
			observability.RecordEventFailure()
			responses = append(responses, models.EventResponse{
				EventID:    event.EventID,
				Status:     "error",
				ReceivedAt: now.Format(time.RFC3339Nano),
			})
			continue
		}

		c.enrichEvent(event, meta)
		c.scoreBot(ctx, event, meta.ClientIP)

		// Ensure event ID
		if event.EventID == "" {
			event.EventID = uuid.New().String()
		}

		// Serialize event
		eventJSON, err := json.Marshal(event)
		if err != nil {
			observability.RecordEventFailure()
			responses = append(responses, models.EventResponse{
				EventID:    event.EventID,
				Status:     "error",
				ReceivedAt: now.Format(time.RFC3339Nano),
			})
			continue
		}

		// Push to Redis Stream
		streamKey := "events:stream"
		_, err = c.redis.XAdd(ctx, &redis.XAddArgs{
			Stream: streamKey,
			Values: map[string]interface{}{
				"site_id":   siteID,
				"event":     string(eventJSON),
				"timestamp": now.UnixMilli(),
			},
		}).Result()

		if err != nil {
			observability.RecordEventFailure()
			responses = append(responses, models.EventResponse{
				EventID:    event.EventID,
				Status:     "error",
				ReceivedAt: now.Format(time.RFC3339Nano),
			})
			continue
		}
		observability.RecordEventReceived(1)

		// Update realtime tracking
		c.updateRealtime(ctx, siteID, event)

		responses = append(responses, models.EventResponse{
			EventID:    event.EventID,
			Status:     "ok",
			ReceivedAt: now.Format(time.RFC3339Nano),
		})
	}

	return responses, nil
}

// updateRealtime updates the realtime online users ZSET
func (c *Collector) updateRealtime(ctx context.Context, siteID string, event *models.Event) {
	key := fmt.Sprintf("online:%s", siteID)
	score := float64(time.Now().Unix())
	member := fmt.Sprintf("%s:%s", event.ClientID, event.SessionID)

	c.redis.ZAdd(ctx, key, redis.Z{Score: score, Member: member})

	// Remove entries older than 5 minutes
	cutoff := float64(time.Now().Add(-5 * time.Minute).Unix())
	c.redis.ZRemRangeByScore(ctx, key, "-inf", fmt.Sprintf("%f", cutoff))
}

func (c *Collector) scoreBot(ctx context.Context, event *models.Event, clientIP string) {
	if c.scorer == nil {
		return
	}
	score, reasons := c.scorer.Score(ctx, event, clientIP)
	if score > event.BotScore {
		event.BotScore = score
	}
	if len(reasons) > 0 {
		reason := strings.Join(reasons, ",")
		if event.BotReason == "" {
			event.BotReason = reason
		} else if !strings.Contains(event.BotReason, reason) {
			event.BotReason = event.BotReason + "," + reason
		}
	}
	observability.RecordBotScore(float64(event.BotScore))
}

func (c *Collector) enrichEvent(event *models.Event, meta RequestMetadata) {
	if meta.IPHash != "" && event.IPHash == "" {
		event.IPHash = meta.IPHash
	}
	if meta.Country != "" && event.Country == "" {
		event.Country = meta.Country
	}
	if meta.City != "" && event.City == "" {
		event.City = meta.City
	}
	if event.UserAgent == "" {
		return
	}

	ua := useragent.New(event.UserAgent)
	browserName, browserVersion := ua.Browser()
	if event.Browser == "" {
		event.Browser = browserName
	}
	if event.BrowserVersion == "" {
		event.BrowserVersion = browserVersion
	}
	if event.OS == "" {
		event.OS = ua.OS()
	}
	if event.DeviceType == "" {
		event.DeviceType = detectDeviceType(ua, event.UserAgent)
	}
	if ua.Bot() {
		event.BotScore = 100
		event.BotReason = "user_agent_bot"
	}
}

func detectDeviceType(ua *useragent.UserAgent, rawUA string) string {
	lowered := strings.ToLower(rawUA)
	switch {
	case ua.Bot():
		return "bot"
	case strings.Contains(lowered, "ipad"),
		strings.Contains(lowered, "tablet"),
		strings.Contains(lowered, "kindle"),
		strings.Contains(lowered, "silk"),
		strings.Contains(lowered, "playbook"),
		strings.Contains(lowered, "sm-t"),
		strings.Contains(lowered, "tab"):
		return "tablet"
	case ua.Mobile():
		return "mobile"
	default:
		return "desktop"
	}
}

// Deduplicate checks if a single event has already been processed.
func (c *Collector) Deduplicate(ctx context.Context, siteID, eventID string) (bool, error) {
	if eventID == "" {
		return false, nil
	}
	key := fmt.Sprintf("dedupe:%s:%s", siteID, eventID)
	set, err := c.redis.SetNX(ctx, key, "1", 24*time.Hour).Result()
	if err != nil {
		return false, err
	}
	return !set, nil // true = duplicate
}

// DeduplicateBatch checks multiple event IDs in a single Redis pipeline round-trip.
// Returns a slice of booleans — true means the event is a duplicate.
func (c *Collector) DeduplicateBatch(ctx context.Context, siteID string, eventIDs []string) ([]bool, error) {
	if len(eventIDs) == 0 {
		return nil, nil
	}
	pipe := c.redis.Pipeline()
	cmds := make([]*redis.BoolCmd, len(eventIDs))
	for i, id := range eventIDs {
		key := fmt.Sprintf("dedupe:%s:%s", siteID, id)
		cmds[i] = pipe.SetNX(ctx, key, "1", 24*time.Hour)
	}
	if _, err := pipe.Exec(ctx); err != nil && !errors.Is(err, redis.Nil) {
		return nil, err
	}
	results := make([]bool, len(eventIDs))
	for i, cmd := range cmds {
		isNew, _ := cmd.Result()
		results[i] = !isNew // true = duplicate
	}
	return results, nil
}

// HashIP creates a privacy-safe hash of the client IP.
// The salt is read once from the IP_HASH_SALT environment variable.
func HashIP(ip string) string {
	hash := sha256.Sum256([]byte(ip + ipSalt()))
	return hex.EncodeToString(hash[:16])
}

func validateEventSemantics(event *models.Event) error {
	switch event.EventName {
	case "pageview", "session_start", "scroll_depth", "checkout_start":
		return nil
	case "product_view":
		if !hasStringValue(event.ProductID, event.Properties, "product_id") {
			return fmt.Errorf("product_view requires product_id")
		}
		return nil
	case "add_to_cart":
		if !hasStringValue(event.ProductID, event.Properties, "product_id") {
			return fmt.Errorf("add_to_cart requires product_id")
		}
		if !hasPositiveUint(event.Quantity, event.Properties, "quantity") {
			return fmt.Errorf("add_to_cart requires quantity")
		}
		return nil
	case "purchase":
		if !hasStringValue(event.OrderID, event.Properties, "order_id") {
			return fmt.Errorf("purchase requires order_id")
		}
		if !hasPositiveFloat(event.Revenue, event.Properties, "revenue") {
			return fmt.Errorf("purchase requires revenue")
		}
		if !hasStringValue(event.Currency, event.Properties, "currency") {
			return fmt.Errorf("purchase requires currency")
		}
		return nil
	default:
		return nil
	}
}

func hasStringValue(value string, properties map[string]interface{}, key string) bool {
	if strings.TrimSpace(value) != "" {
		return true
	}
	if properties == nil {
		return false
	}
	raw, ok := properties[key]
	if !ok {
		return false
	}
	switch typed := raw.(type) {
	case string:
		return strings.TrimSpace(typed) != ""
	default:
		return fmt.Sprintf("%v", typed) != ""
	}
}

func hasPositiveUint(value uint32, properties map[string]interface{}, key string) bool {
	if value > 0 {
		return true
	}
	if properties == nil {
		return false
	}
	raw, ok := properties[key]
	if !ok {
		return false
	}
	switch typed := raw.(type) {
	case int:
		return typed > 0
	case int64:
		return typed > 0
	case float64:
		return typed > 0
	case float32:
		return typed > 0
	default:
		return false
	}
}

func hasPositiveFloat(value float64, properties map[string]interface{}, key string) bool {
	if value > 0 {
		return true
	}
	if properties == nil {
		return false
	}
	raw, ok := properties[key]
	if !ok {
		return false
	}
	switch typed := raw.(type) {
	case int:
		return typed > 0
	case int64:
		return typed > 0
	case float64:
		return typed > 0
	case float32:
		return typed > 0
	case string:
		return strings.TrimSpace(typed) != "" && typed != "0"
	default:
		return false
	}
}
