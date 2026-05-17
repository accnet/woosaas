package order_status

import (
	"strings"

	"github.com/accnet/woosaas/api/pkg/models"
)

const (
	StatusProcessing     = "processing"
	StatusFulfilled      = "fulfilled"
	StatusInTransit      = "in_transit"
	StatusOutForDelivery = "out_for_delivery"
	StatusDelivered      = "delivered"
	StatusException      = "exception"
	StatusFailedDelivery = "failed_delivery"
	StatusReturned       = "returned"
	StatusCancelled      = "cancelled"
	StatusRefunded       = "refunded"
	StatusDeleted        = "deleted"
)

var terminalStatusPriority = map[string]int{
	StatusCancelled: 100,
	StatusRefunded:  101,
	StatusDeleted:   102,
}

var progressPriority = map[string]int{
	StatusProcessing:     1,
	StatusFulfilled:      2,
	StatusInTransit:      3,
	StatusOutForDelivery: 4,
	StatusDelivered:      5,
	StatusException:      4,
	StatusFailedDelivery: 4,
	StatusReturned:       5,
}

func FromOrderInput(input models.WooOrderInput) string {
	rawStatus := Normalize(input.Status)
	paymentStatus := normalizePaymentStatus(input.PaymentStatus)
	fulfillmentStatus := normalizeFulfillmentStatus(input.FulfillmentStatus)

	switch rawStatus {
	case StatusCancelled, StatusRefunded, StatusDeleted:
		return rawStatus
	case "failed":
		return StatusException
	case StatusDelivered, StatusInTransit, StatusOutForDelivery, StatusException, StatusFailedDelivery, StatusReturned, StatusFulfilled, StatusProcessing:
		return rawStatus
	case "completed":
		if fulfillmentStatus == "fulfilled" {
			return StatusDelivered
		}
		return StatusFulfilled
	}

	if paymentStatus == "refunded" || paymentStatus == "partially_refunded" || paymentStatus == "voided" {
		return StatusRefunded
	}
	if fulfillmentStatus == "fulfilled" {
		return StatusFulfilled
	}
	if paymentStatus == "paid" {
		return StatusProcessing
	}
	if rawStatus != "" {
		return rawStatus
	}
	return StatusProcessing
}

func FromTrackingStatus(status string) string {
	switch Normalize(status) {
	case StatusCancelled, StatusRefunded, StatusDeleted:
		return Normalize(status)
	case "", "pending", "info_received", "available_for_pickup", StatusFulfilled:
		return StatusFulfilled
	case StatusInTransit:
		return StatusInTransit
	case StatusOutForDelivery:
		return StatusOutForDelivery
	case StatusDelivered:
		return StatusDelivered
	case "failed_attempt", StatusFailedDelivery:
		return StatusFailedDelivery
	case "expired", StatusException:
		return StatusException
	case "return_to_sender", StatusReturned:
		return StatusReturned
	default:
		return StatusFulfilled
	}
}

func ImpliesFulfilled(status string) bool {
	switch Normalize(status) {
	case StatusFulfilled, StatusInTransit, StatusOutForDelivery, StatusDelivered, StatusException, StatusFailedDelivery, StatusReturned:
		return true
	default:
		return false
	}
}

func Merge(current, candidate string) string {
	current = Normalize(current)
	candidate = Normalize(candidate)
	if candidate == "" {
		return current
	}
	if current == "" {
		return candidate
	}

	if terminalStatusPriority[current] > 0 {
		if terminalStatusPriority[candidate] > terminalStatusPriority[current] {
			return candidate
		}
		return current
	}
	if terminalStatusPriority[candidate] > 0 {
		return candidate
	}

	if progressPriority[candidate] >= progressPriority[current] {
		return candidate
	}
	return current
}

func Normalize(status string) string {
	switch strings.ToLower(strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(status, "-", "_"), " ", "_"))) {
	case "":
		return ""
	case "processing":
		return StatusProcessing
	case "fulfilled":
		return StatusFulfilled
	case "in_transit":
		return StatusInTransit
	case "out_for_delivery":
		return StatusOutForDelivery
	case "delivered", "completed":
		return StatusDelivered
	case "exception", "failed":
		return StatusException
	case "failed_attempt", "failed_delivery":
		return StatusFailedDelivery
	case "returned", "return_to_sender":
		return StatusReturned
	case "cancelled":
		return StatusCancelled
	case "refunded", "partially_refunded", "voided":
		return StatusRefunded
	case "deleted":
		return StatusDeleted
	default:
		return strings.ToLower(strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(status, "-", "_"), " ", "_")))
	}
}

func normalizePaymentStatus(status string) string {
	return strings.ToLower(strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(status, "-", "_"), " ", "_")))
}

func normalizeFulfillmentStatus(status string) string {
	status = strings.ToLower(strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(status, "-", "_"), " ", "_")))
	if status == "" {
		return "unfulfilled"
	}
	return status
}
