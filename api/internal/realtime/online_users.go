package realtime

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

type OnlineUsers struct {
	redis *redis.Client
}

func NewOnlineUsers(redisClient *redis.Client) *OnlineUsers {
	return &OnlineUsers{redis: redisClient}
}

// GetOnlineCount returns the number of unique users online in the last N minutes
func (r *OnlineUsers) GetOnlineCount(ctx context.Context, siteID string, minutes int) (int64, error) {
	key := fmt.Sprintf("online:%s", siteID)
	cutoff := float64(time.Now().Add(-time.Duration(minutes) * time.Minute).Unix())

	return r.redis.ZCount(ctx, key, fmt.Sprintf("%f", cutoff), "+inf").Result()
}

// GetOnlineUsers returns unique client IDs online in the last N minutes
func (r *OnlineUsers) GetOnlineUsers(ctx context.Context, siteID string, minutes int) ([]string, error) {
	key := fmt.Sprintf("online:%s", siteID)
	cutoff := float64(time.Now().Add(-time.Duration(minutes) * time.Minute).Unix())

	// Get all members in the range
	members, err := r.redis.ZRangeByScore(ctx, key, &redis.ZRangeBy{
		Min: fmt.Sprintf("%f", cutoff),
		Max: "+inf",
	}).Result()

	if err != nil {
		return nil, err
	}

	// Extract unique client IDs
	seen := make(map[string]bool)
	var uniqueClients []string

	for _, member := range members {
		// Member format is "client_id:session_id"
		var clientID string
		for i := 0; i < len(member); i++ {
			if member[i] == ':' {
				clientID = member[:i]
				break
			}
		}

		if clientID != "" && !seen[clientID] {
			seen[clientID] = true
			uniqueClients = append(uniqueClients, clientID)
		}
	}

	return uniqueClients, nil
}

// UpdatePresence updates the presence of a client in a session
func (r *OnlineUsers) UpdatePresence(ctx context.Context, siteID, clientID, sessionID string) error {
	key := fmt.Sprintf("online:%s", siteID)
	member := fmt.Sprintf("%s:%s", clientID, sessionID)
	score := float64(time.Now().Unix())

	return r.redis.ZAdd(ctx, key, redis.Z{
		Score:  score,
		Member: member,
	}).Err()
}

// Cleanup removes stale entries older than the threshold
func (r *OnlineUsers) Cleanup(ctx context.Context, siteID string, maxAge time.Duration) error {
	key := fmt.Sprintf("online:%s", siteID)
	cutoff := float64(time.Now().Add(-maxAge).Unix())

	// Remove entries older than maxAge
	_, err := r.redis.ZRemRangeByScore(ctx, key, "-inf", fmt.Sprintf("%f", cutoff)).Result()
	return err
}