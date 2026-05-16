package shopbase

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/accnet/woosaas/api/pkg/models"
)

// MapOrderToInput converts a ShopBase Order DTO to the internal WooOrderInput.
func MapOrderToInput(o Order, siteID string) models.WooOrderInput {
	input := models.WooOrderInput{
		WooOrderID:        fmt.Sprintf("%d", o.ID),
		WooCustomerID:     fmt.Sprintf("%d", o.Customer.ID),
		SourcePlatform:    "shopbase",
		ExternalOrderName: o.Name,
		CheckoutToken:     o.CheckoutToken,
		CartToken:         o.CartToken,
		OrderStatusURL:    o.OrderStatusURL,
		PaymentGateway:    o.PaymentGateway,
		ReferringSite:     o.ReferringSite,
		Status:            mapOrderStatus(o),
		PaymentStatus:     o.FinancialStatus,
		FulfillmentStatus: mapFulfillmentStatus(o.FulfillmentStatus),
		Currency:          o.Currency,
		TotalAmount:       parseDecimal(o.TotalPrice),
		SubtotalAmount:    parseDecimal(o.SubtotalPrice),
		DiscountAmount:    parseDecimal(o.TotalDiscounts),
		ShippingAmount:    shippingAmount(o),
		TaxAmount:         parseDecimal(o.TotalTax),
		RefundAmount:      refundAmount(o),
		ItemsCount:        len(o.LineItems),
		CustomerEmail:     o.Email,
		CustomerPhone:     o.Phone,
		DeliveryMethod:    deliveryMethod(o),
		BillingAddress:    addressToMap(o.BillingAddress),
		ShippingAddress:   addressToMap(o.ShippingAddress),
		RawOrder:          orderToRawMap(o),
	}

	if o.Customer.FirstName != "" {
		input.CustomerFirstName = o.Customer.FirstName
		input.CustomerLastName = o.Customer.LastName
	} else {
		input.CustomerFirstName = o.BillingAddress.FirstName
		input.CustomerLastName = o.BillingAddress.LastName
		input.BillingCompany = o.BillingAddress.Company
	}

	if o.CreatedAt != nil {
		s := o.CreatedAt.UTC().Format(time.RFC3339)
		input.CreatedAtWoo = &s
	}
	if o.UpdatedAt != nil {
		input.ModifiedAtWoo = o.UpdatedAt.UTC().Format(time.RFC3339)
	} else if o.CreatedAt != nil {
		input.ModifiedAtWoo = o.CreatedAt.UTC().Format(time.RFC3339)
	}
	if o.ProcessedAt != nil && o.FinancialStatus == "paid" {
		s := o.ProcessedAt.UTC().Format(time.RFC3339)
		input.PaidAtWoo = &s
	}
	if o.CancelledAt != nil {
		s := o.CancelledAt.UTC().Format(time.RFC3339)
		input.DeletedAtWoo = &s
	}

	for _, li := range o.LineItems {
		input.Items = append(input.Items, mapLineItem(li))
	}

	return input
}

// MapShopToMetadata converts a ShopBase Shop DTO to ShopMetadata.
func MapShopToMetadata(s Shop) models.ShopMetadata {
	platformDomain := s.MyshopifyDomain
	if platformDomain == "" {
		platformDomain = s.Domain
	}
	return models.ShopMetadata{
		ExternalShopID: fmt.Sprintf("%d", s.ID),
		Name:           s.Name,
		Domain:         platformDomain,
		PlatformDomain: platformDomain,
		PrimaryDomain:  s.PrimaryDomain,
		Currency:       s.Currency,
		Timezone:       s.Timezone,
		Country:        s.CountryCode,
	}
}

func mapLineItem(li LineItem) models.WooOrderItemInput {
	tax := 0.0
	for _, tl := range li.TaxLines {
		tax += parseDecimal(tl.Price)
	}
	return models.WooOrderItemInput{
		LineItemID:        fmt.Sprintf("%d", li.ID),
		ProductID:         fmt.Sprintf("%d", li.ProductID),
		VariationID:       fmt.Sprintf("%d", li.VariantID),
		ExternalVariantID: fmt.Sprintf("%d", li.VariantID),
		SKU:               li.SKU,
		Name:              fullItemName(li),
		Quantity:          li.Quantity,
		UnitPrice:         parseDecimal(li.Price),
		LineSubtotal:      parseDecimal(li.LineSubtotal),
		LineTotal:         parseDecimal(li.LineTotal),
		LineTax:           tax,
	}
}

func mapOrderStatus(o Order) string {
	if o.CancelledAt != nil {
		return "cancelled"
	}
	switch o.FinancialStatus {
	case "paid":
		return "processing"
	case "refunded", "voided":
		return "refunded"
	default:
		return "pending"
	}
}

func mapFulfillmentStatus(s string) string {
	if s == "" {
		return "unfulfilled"
	}
	return s
}

func deliveryMethod(o Order) string {
	if len(o.ShippingLines) > 0 {
		if o.ShippingLines[0].Title != "" {
			return o.ShippingLines[0].Title
		}
		return o.ShippingLines[0].Code
	}
	return ""
}

func shippingAmount(o Order) float64 {
	total := 0.0
	for _, sl := range o.ShippingLines {
		total += parseDecimal(sl.Price)
	}
	return total
}

func refundAmount(o Order) float64 {
	// Sum refund transactions if available — ShopBase refund detail requires
	// a separate API call, so we use 0.0 here and rely on reconciliation updates.
	return 0.0
}

func fullItemName(li LineItem) string {
	if li.VariantTitle != "" && li.VariantTitle != "Default Title" {
		return li.Title + " - " + li.VariantTitle
	}
	return li.Title
}

func addressToMap(a Address) map[string]interface{} {
	return map[string]interface{}{
		"first_name": a.FirstName,
		"last_name":  a.LastName,
		"company":    a.Company,
		"phone":      a.Phone,
		"address_1":  a.Address1,
		"address_2":  a.Address2,
		"city":       a.City,
		"state":      a.Province,
		"country":    a.Country,
		"postcode":   a.Zip,
	}
}

func orderToRawMap(o Order) map[string]interface{} {
	return map[string]interface{}{
		"id":                 o.ID,
		"name":               o.Name,
		"financial_status":   o.FinancialStatus,
		"fulfillment_status": o.FulfillmentStatus,
		"total_price":        string(o.TotalPrice),
		"currency":           o.Currency,
	}
}

func parseDecimal(value interface{}) float64 {
	var s string
	switch v := value.(type) {
	case string:
		s = v
	case DecimalString:
		s = string(v)
	default:
		s = fmt.Sprint(v)
	}
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	return f
}
