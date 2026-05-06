package observability

import (
	"context"
	"log"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	// HTTP metrics
	httpRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "Total number of HTTP requests",
		},
		[]string{"method", "endpoint", "status"},
	)

	httpRequestDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "http_request_duration_seconds",
			Help:    "HTTP request duration in seconds",
			Buckets: []float64{0.01, 0.05, 0.1, 0.5, 1, 5},
		},
		[]string{"method", "endpoint"},
	)

	// Event metrics
	eventsReceivedTotal = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "events_received_total",
			Help: "Total number of events received",
		},
	)

	eventsProcessedTotal = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "events_processed_total",
			Help: "Total number of events processed",
		},
	)

	eventsFailedTotal = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "events_failed_total",
			Help: "Total number of failed events",
		},
	)

	// Queue metrics
	queueSize = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "queue_size",
			Help: "Current queue size",
		},
	)

	// Bot metrics
	botScoreDistribution = promauto.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "bot_score_distribution",
			Help:    "Distribution of bot scores",
			Buckets: []float64{10, 20, 30, 40, 50, 60, 70, 80, 90, 100},
		},
	)
)

// RecordRequest records HTTP request metrics
func RecordRequest(method, endpoint, status string, duration time.Duration) {
	httpRequestsTotal.WithLabelValues(method, endpoint, status).Inc()
	httpRequestDuration.WithLabelValues(method, endpoint).Observe(duration.Seconds())
}

// RecordEvent records event metrics
func RecordEvent(received bool) {
	if received {
		eventsReceivedTotal.Inc()
	} else {
		eventsProcessedTotal.Inc()
	}
}

// RecordEventFailure records failed event
func RecordEventFailure() {
	eventsFailedTotal.Inc()
}

// SetQueueSize sets current queue size
func SetQueueSize(size float64) {
	queueSize.Set(size)
}

// RecordBotScore records bot score
func RecordBotScore(score float64) {
	botScoreDistribution.Observe(score)
}

// StructuredLogger provides structured logging
type StructuredLogger struct {
	logger *log.Logger
}

func NewStructuredLogger() *StructuredLogger {
	return &StructuredLogger{
		logger: log.Default(),
	}
}

// LogEvent logs a structured event
func (l *StructuredLogger) LogEvent(ctx context.Context, eventType string, data map[string]interface{}) {
	log.Printf("[%s] %v", eventType, data)
}

// LogError logs an error with context
func (l *StructuredLogger) LogError(ctx context.Context, operation string, err error, data map[string]interface{}) {
	log.Printf("[ERROR] %s: %v %v", operation, err, data)
}

// LogSlowQuery logs slow queries
func (l *StructuredLogger) LogSlowQuery(ctx context.Context, query string, duration time.Duration) {
	if duration > 1*time.Second {
		log.Printf("[SLOW] Query took %v: %s", duration, query)
	}
}