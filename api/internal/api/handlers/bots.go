package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/woosaas/api/internal/analytics"
)

type BotsHandler struct {
	bots *analytics.Bots
}

func NewBotsHandler(bots *analytics.Bots) *BotsHandler {
	return &BotsHandler{bots: bots}
}

// GetReport returns bot detection report
func (h *BotsHandler) GetReport(c *gin.Context) {
	siteID := c.Query("site_id")
	from := c.Query("from")
	to := c.Query("to")

	if siteID == "" || from == "" || to == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "site_id, from, and to are required"})
		return
	}

	report, err := h.bots.GetReport(c.Request.Context(), siteID, from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, report)
}
