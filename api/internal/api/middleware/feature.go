package middleware

import (
	"context"
	"net/http"

	"github.com/accnet/woosaas/api/internal/billing"
	"github.com/gin-gonic/gin"
)

type featurePlanProvider interface {
	GetPlanForUser(ctx context.Context, userID string) (*billing.Plan, error)
}

type FeatureMiddleware struct {
	plans featurePlanProvider
}

func NewFeatureMiddleware(plans featurePlanProvider) *FeatureMiddleware {
	return &FeatureMiddleware{plans: plans}
}

func (m *FeatureMiddleware) RequireFeature(feature string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if m == nil || m.plans == nil {
			c.Next()
			return
		}
		userID := c.GetString("user_id")
		if userID == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
			c.Abort()
			return
		}
		plan, err := m.plans.GetPlanForUser(c.Request.Context(), userID)
		if err != nil || !plan.HasFeature(feature) {
			c.JSON(http.StatusPaymentRequired, gin.H{"error": "Feature not available on your plan"})
			c.Abort()
			return
		}
		c.Next()
	}
}
