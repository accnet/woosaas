package observability

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func Metrics() gin.HandlerFunc {
	h := promhttp.Handler()
	return func(c *gin.Context) {
		h.ServeHTTP(c.Writer, c.Request)
	}
}

func Recovery(logger *StructuredLogger) gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
				logger.LogError(c.Request.Context(), "panic_recovery", nil, map[string]interface{}{
					"error": err,
				})
				c.AbortWithStatus(500)
			}
		}()
		c.Next()
	}
}

func RequestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		
		c.Next()
		
		duration := time.Since(start)
		RecordRequest(c.Request.Method, path, string(rune(c.Writer.Status())), duration)
	}
}