package ingest

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	"github.com/mssola/useragent"
	"github.com/redis/go-redis/v9"
	"github.com/woosaas/api/pkg/models"
)

type Collector struct {
	redis     *redis.Client
	validator *validator.Validate
}

func NewCollector(redisClient *redis.Client) *Collector {
	v := validator.New()
	return &Collector{
		redis:     redisClient,
		validator: v,
	}
}

// CollectEvent processes and queues a single event
func (c *Collector) CollectEvent(ctx context.Context, siteID string, event *models.Event, ipHash string) error {
	// Validate event
	if err := c.validator.Struct(event); err != nil {
		return fmt.Errorf("validation error: %w", err)
	}

	// Parse user agent
	if event.UserAgent != "" {
		ua := useragent.New(event.UserAgent)
		event.Browser, event.OS = ua.Browser()
		if ua.Bot() {
			event.BotScore = 100
			event.BotReason = "user_agent_bot"
		}
	}

	// Set IP hash
	event.IPHash = ipHash

	// Set site ID
	// Note: We assume site_id is already set by middleware

	// Generate server timestamp
	event.EventID = uuid.New().String()

	// Serialize event
	eventJSON, err := json.Marshal(event)
	if err != nil {
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
		return fmt.Errorf("failed to push to stream: %w", err)
	}

	// Update realtime tracking
	c.updateRealtime(ctx, siteID, event)

	return nil
}

// CollectBatch processes and queues multiple events
func (c *Collector) CollectBatch(ctx context.Context, siteID string, events []models.Event, ipHash string) ([]models.EventResponse, error) {
	responses := make([]models.EventResponse, 0, len(events))
	now := time.Now()

	for i := range events {
		event := &events[i]
		
		// Validate event
		if err := c.validator.Struct(event); err != nil {
			responses = append(responses, models.EventResponse{
				EventID:    event.EventID,
				Status:     "error",
				ReceivedAt: now.Format(time.RFC3339Nano),
			})
			continue
		}

		// Parse user agent
		if event.UserAgent != "" {
			ua := useragent.New(event.UserAgent)
			event.Browser, event.OS = ua.Browser()
			if ua.Bot() {
				event.BotScore = 100
				event.BotReason = "user_agent_bot"
			}
		}

		// Set IP hash
		event.IPHash = ipHash

		// Ensure event ID
		if event.EventID == "" {
			event.EventID = uuid.New().String()
		}

		// Serialize event
		eventJSON, err := json.Marshal(event)
		if err != nil {
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
			responses = append(responses, models.EventResponse{
				EventID:    event.EventID,
				Status:     "error",
				ReceivedAt: now.Format(time.RFC3339Nano),
			})
			continue
		}

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

// Deduplicate checks if an event has already been processed
func (c *Collector) Deduplicate(ctx context.Context, siteID, eventID string) (bool, error) {
	key := fmt.Sprintf("dedupe:%s:%s", siteID, eventID)
	
	// Try to set the key with NX (only if not exists)
	set, err := c.redis.SetNX(ctx, key, "1", 24*time.Hour).Result()
	if err != nil {
		return false, err
	}

	return !set, nil // true if duplicate (key already existed)
}

// HashIP creates a hash of the client IP for privacy
func HashIP(ip string) string {
	hash := sha256.Sum256([]byte(ip + "woosaas-salt"))
	return hex.EncodeToString(hash[:16])
}