package bot

import (
	"context"
	"regexp"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/accnet/woosaas/api/pkg/models"
)

// Scorer handles bot detection
type Scorer struct {
	redis      *redis.Client
	userAgents []string
	ipPatterns []*regexp.Regexp
}

func NewScorer(redis *redis.Client) *Scorer {
	return &Scorer{
		redis: redis,
		userAgents: []string{
			"curl",
			"wget",
			"python-requests",
			"httpie",
			"postman",
			"insomnia",
			"go-http",
			"axios",
			"fetch",
			"okhttp",
		},
		ipPatterns: []*regexp.Regexp{
			regexp.MustCompile(`^45\.33\.`),             // Linode
			regexp.MustCompile(`^104\.24\.|^172\.70\.`), // Cloudflare
		},
	}
}

// Score returns bot score (0-100) based on signals
func (s *Scorer) Score(ctx context.Context, event *models.Event) (int, []string) {
	var score int
	var reasons []string

	// Check user agent blacklisted patterns
	if event.UserAgent != "" {
		ua := strings.ToLower(event.UserAgent)
		for _, pattern := range s.userAgents {
			if strings.Contains(ua, pattern) {
				score += 40
				reasons = append(reasons, "user_agent_blacklist")
				break
			}
		}
	}

	// Check for empty user agent
	if event.UserAgent == "" || len(event.UserAgent) < 10 {
		score += 30
		reasons = append(reasons, "empty_user_agent")
	}

	// Check for known bot IP ranges
	if event.IPHash != "" {
		for _, pattern := range s.ipPatterns {
			if pattern.MatchString(event.IPHash) {
				score += 20
				reasons = append(reasons, "datacenter_ip")
				break
			}
		}
	}

	// Check event rate (if Redis has rate info)
	if s.redis != nil && event.SessionID != "" {
		key := "bot_rate:" + event.SessionID
		count, err := s.redis.Incr(ctx, key).Result()
		if err == nil {
			s.redis.Expire(ctx, key, time.Hour)
			if count > 100 { // More than 100 events per hour in single session
				score += 30
				reasons = append(reasons, "high_event_rate")
			}
		}
	}

	// Cap at 100
	if score > 100 {
		score = 100
	}

	return score, reasons
}

// IsBot returns true if bot_score >= threshold
func (s *Scorer) IsBot(botScore int) bool {
	return botScore >= 70
}
