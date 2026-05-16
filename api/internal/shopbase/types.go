package shopbase

import (
	"bytes"
	"encoding/json"
	"time"
)

// DecimalString accepts ShopBase amount fields returned as strings, numbers, or
// Shopify-style money sets such as {"shop_money":{"amount":"10.00"}}.
type DecimalString string

func (d *DecimalString) UnmarshalJSON(data []byte) error {
	data = bytes.TrimSpace(data)
	if len(data) == 0 || bytes.Equal(data, []byte("null")) {
		*d = ""
		return nil
	}
	if data[0] == '"' {
		var s string
		if err := json.Unmarshal(data, &s); err != nil {
			return err
		}
		*d = DecimalString(s)
		return nil
	}
	if data[0] == '{' {
		var obj map[string]interface{}
		if err := json.Unmarshal(data, &obj); err != nil {
			return err
		}
		if amount := amountFromMap(obj); amount != "" {
			*d = DecimalString(amount)
			return nil
		}
		*d = ""
		return nil
	}
	*d = DecimalString(string(data))
	return nil
}

func amountFromMap(obj map[string]interface{}) string {
	for _, key := range []string{"amount", "price"} {
		if v, ok := obj[key]; ok {
			if s, ok := v.(string); ok {
				return s
			}
		}
	}
	for _, key := range []string{"shop_money", "presentment_money"} {
		if nested, ok := obj[key].(map[string]interface{}); ok {
			if s := amountFromMap(nested); s != "" {
				return s
			}
		}
	}
	return ""
}

// Auth holds private app credentials.
type Auth struct {
	APIKey      string
	APIPassword string
}

// Shop represents the ShopBase store metadata.
type Shop struct {
	ID              int64  `json:"id"`
	Name            string `json:"name"`
	Email           string `json:"email"`
	Domain          string `json:"domain"`
	PrimaryDomain   string `json:"primary_domain"`
	MyshopifyDomain string `json:"myshopify_domain"`
	Currency        string `json:"currency"`
	Timezone        string `json:"iana_timezone"`
	CountryCode     string `json:"country_code"`
}

// ShopResponse wraps the API response for /admin/shop.json.
type ShopResponse struct {
	Shop Shop `json:"shop"`
}

// Address is a billing/shipping address.
type Address struct {
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Company   string `json:"company"`
	Phone     string `json:"phone"`
	Address1  string `json:"address1"`
	Address2  string `json:"address2"`
	City      string `json:"city"`
	Province  string `json:"province"`
	Country   string `json:"country"`
	Zip       string `json:"zip"`
}

// ShippingLine represents a shipping method on an order.
type ShippingLine struct {
	Code  string        `json:"code"`
	Title string        `json:"title"`
	Price DecimalString `json:"price"`
}

// LineItem represents a product line in an order.
type LineItem struct {
	ID            int64                    `json:"id"`
	ProductID     int64                    `json:"product_id"`
	VariantID     int64                    `json:"variant_id"`
	SKU           string                   `json:"sku"`
	Title         string                   `json:"title"`
	VariantTitle  string                   `json:"variant_title"`
	Quantity      int                      `json:"quantity"`
	Price         DecimalString            `json:"price"`
	TotalDiscount DecimalString            `json:"total_discount"`
	LineSubtotal  DecimalString            `json:"subtotal_price"`
	LineTotal     DecimalString            `json:"total_price"`
	TaxLines      []TaxLine                `json:"tax_lines"`
	Properties    []map[string]interface{} `json:"properties"`
}

// TaxLine represents a tax applied to a line item or order.
type TaxLine struct {
	Title string        `json:"title"`
	Rate  float64       `json:"rate"`
	Price DecimalString `json:"price"`
}

// Refund represents a refund on an order.
type Refund struct {
	ID          int64         `json:"id"`
	OrderID     int64         `json:"order_id"`
	CreatedAt   time.Time     `json:"created_at"`
	Note        string        `json:"note"`
	TotalDuties DecimalString `json:"total_duties_set"`
}

// FulfillmentLineItem is a line item within a fulfillment.
type FulfillmentLineItem struct {
	ID         int64 `json:"id"`
	LineItemID int64 `json:"line_item_id"`
	Quantity   int   `json:"quantity"`
}

// Fulfillment represents a fulfillment on an order.
type Fulfillment struct {
	ID        int64                 `json:"id"`
	OrderID   int64                 `json:"order_id"`
	Status    string                `json:"status"`
	LineItems []FulfillmentLineItem `json:"line_items"`
}

// Order is the ShopBase order DTO.
type Order struct {
	ID                int64          `json:"id"`
	Name              string         `json:"name"`
	OrderNumber       int            `json:"order_number"`
	Email             string         `json:"email"`
	Phone             string         `json:"phone"`
	Currency          string         `json:"currency"`
	FinancialStatus   string         `json:"financial_status"`
	FulfillmentStatus string         `json:"fulfillment_status"`
	TotalPrice        DecimalString  `json:"total_price"`
	SubtotalPrice     DecimalString  `json:"subtotal_price"`
	TotalDiscounts    DecimalString  `json:"total_discounts"`
	TotalShipping     DecimalString  `json:"total_shipping_price_set"`
	TotalTax          DecimalString  `json:"total_tax"`
	ShippingLines     []ShippingLine `json:"shipping_lines"`
	BillingAddress    Address        `json:"billing_address"`
	ShippingAddress   Address        `json:"shipping_address"`
	LineItems         []LineItem     `json:"line_items"`
	CheckoutToken     string         `json:"checkout_token"`
	CartToken         string         `json:"cart_token"`
	OrderStatusURL    string         `json:"order_status_url"`
	PaymentGateway    string         `json:"payment_gateway"`
	ReferringSite     string         `json:"referring_site"`
	Refunds           []Refund       `json:"refunds"`
	Fulfillments      []Fulfillment  `json:"fulfillments"`
	CreatedAt         *time.Time     `json:"created_at"`
	ProcessedAt       *time.Time     `json:"processed_at"`
	UpdatedAt         *time.Time     `json:"updated_at"`
	CancelledAt       *time.Time     `json:"cancelled_at"`
	Customer          Customer       `json:"customer"`
}

// OrdersResponse wraps paginated order list.
type OrdersResponse struct {
	Orders []Order `json:"orders"`
}

// Customer is the ShopBase customer DTO.
type Customer struct {
	ID        int64      `json:"id"`
	Email     string     `json:"email"`
	Phone     string     `json:"phone"`
	FirstName string     `json:"first_name"`
	LastName  string     `json:"last_name"`
	CreatedAt *time.Time `json:"created_at"`
	UpdatedAt *time.Time `json:"updated_at"`
}

// CustomersResponse wraps paginated customer list.
type CustomersResponse struct {
	Customers []Customer `json:"customers"`
}

// ProductVariant holds variant info for a product.
type ProductVariant struct {
	ID        int64         `json:"id"`
	ProductID int64         `json:"product_id"`
	Title     string        `json:"title"`
	SKU       string        `json:"sku"`
	Price     DecimalString `json:"price"`
}

// Product is the ShopBase product DTO (lightweight).
type Product struct {
	ID       int64            `json:"id"`
	Title    string           `json:"title"`
	Status   string           `json:"status"`
	Variants []ProductVariant `json:"variants"`
}

// ProductsResponse wraps paginated product list.
type ProductsResponse struct {
	Products []Product `json:"products"`
}

// Webhook represents a registered webhook.
type Webhook struct {
	ID        int64     `json:"id"`
	Topic     string    `json:"topic"`
	Address   string    `json:"address"`
	CreatedAt time.Time `json:"created_at"`
}

// WebhooksResponse wraps webhook list.
type WebhooksResponse struct {
	Webhooks []Webhook `json:"webhooks"`
}

// WebhookCreate is the payload for creating a webhook.
type WebhookCreate struct {
	Topic   string `json:"topic"`
	Address string `json:"address"`
	Format  string `json:"format"`
}

// WebhookCreateRequest wraps the webhook create payload.
type WebhookCreateRequest struct {
	Webhook WebhookCreate `json:"webhook"`
}

// WebhookCreateResponse wraps the webhook create response.
type WebhookCreateResponse struct {
	Webhook Webhook `json:"webhook"`
}

// ScriptTag represents a registered script tag.
type ScriptTag struct {
	ID           int64     `json:"id"`
	Src          string    `json:"src"`
	Event        string    `json:"event"`
	DisplayScope string    `json:"display_scope"`
	CreatedAt    time.Time `json:"created_at"`
}

// ScriptTagsResponse wraps script tag list.
type ScriptTagsResponse struct {
	ScriptTags []ScriptTag `json:"script_tags"`
}

// ScriptTagCreate is the payload for creating a script tag.
type ScriptTagCreate struct {
	Event        string `json:"event"`
	Src          string `json:"src"`
	DisplayScope string `json:"display_scope"`
}

// ScriptTagCreateRequest wraps the script tag create payload.
type ScriptTagCreateRequest struct {
	ScriptTag ScriptTagCreate `json:"script_tag"`
}

// ScriptTagCreateResponse wraps the script tag create response.
type ScriptTagCreateResponse struct {
	ScriptTag ScriptTag `json:"script_tag"`
}

// CountResponse is returned by count endpoints.
type CountResponse struct {
	Count int `json:"count"`
}

// ListParams configures paginated list requests.
type ListParams struct {
	Limit        int
	Page         int
	Status       string
	UpdatedAtMin *time.Time
	CreatedAtMin *time.Time
}
