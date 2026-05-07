package api

import (
	"compress/gzip"
	"io"
	"net/http"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
)

// gzipResponseWriter wraps gin.ResponseWriter to compress output.
type gzipResponseWriter struct {
	gin.ResponseWriter
	writer *gzip.Writer
}

func (g *gzipResponseWriter) Write(data []byte) (int, error) {
	return g.writer.Write(data)
}

func (g *gzipResponseWriter) WriteString(s string) (int, error) {
	return g.writer.Write([]byte(s))
}

// gzipWriterPool reuses gzip.Writer instances to reduce allocations.
var gzipWriterPool = sync.Pool{
	New: func() interface{} {
		w, _ := gzip.NewWriterLevel(io.Discard, gzip.DefaultCompression)
		return w
	},
}

// gzipMiddleware compresses responses when the client sends Accept-Encoding: gzip.
// Skips /health to keep liveness probes lightweight.
func gzipMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Skip health check and non-gzip clients
		if c.Request.URL.Path == "/health" ||
			!strings.Contains(c.GetHeader("Accept-Encoding"), "gzip") {
			c.Next()
			return
		}

		gz := gzipWriterPool.Get().(*gzip.Writer)
		gz.Reset(c.Writer)
		defer func() {
			gz.Close()
			gzipWriterPool.Put(gz)
		}()

		c.Header("Content-Encoding", "gzip")
		c.Header("Vary", "Accept-Encoding")
		// Remove Content-Length — it will be wrong after compression
		c.Header("Content-Length", "")

		grw := &gzipResponseWriter{ResponseWriter: c.Writer, writer: gz}
		c.Writer = grw

		c.Next()

		// Ensure compressed data is flushed even on non-2xx
		if c.Writer.Status() != http.StatusNoContent {
			gz.Flush()
		}
	}
}
