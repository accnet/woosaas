package export

// ColumnDef defines a single exportable order field.
type ColumnDef struct {
	Label string
	Group string
}

// ColumnRegistry is the authoritative list of order_field keys that can be
// referenced in export templates. Keys must be stable — they are persisted in DB.
var ColumnRegistry = map[string]ColumnDef{
	// Order
	"order_id":           {Label: "Order ID", Group: "Order"},
	"order_date":         {Label: "Order Date", Group: "Order"},
	"status":             {Label: "Status", Group: "Order"},
	"payment_status":     {Label: "Payment Status", Group: "Order"},
	"fulfillment_status": {Label: "Fulfillment Status", Group: "Order"},

	// Amounts
	"subtotal":        {Label: "Subtotal", Group: "Amounts"},
	"shipping_amount": {Label: "Shipping Amount", Group: "Amounts"},
	"tax_amount":      {Label: "Tax Amount", Group: "Amounts"},
	"discount_amount": {Label: "Discount Amount", Group: "Amounts"},
	"total_amount":    {Label: "Total Amount", Group: "Amounts"},
	"refund_amount":   {Label: "Refund Amount", Group: "Amounts"},
	"currency":        {Label: "Currency", Group: "Amounts"},

	// Dates
	"created_at":   {Label: "Created At", Group: "Dates"},
	"paid_at":      {Label: "Paid At", Group: "Dates"},
	"completed_at": {Label: "Completed At", Group: "Dates"},
	"fulfilled_at": {Label: "Fulfilled At", Group: "Dates"},

	// Customer
	"customer_name":    {Label: "Customer Name", Group: "Customer"},
	"customer_email":   {Label: "Customer Email", Group: "Customer"},
	"customer_phone":   {Label: "Customer Phone", Group: "Customer"},
	"customer_company": {Label: "Company", Group: "Customer"},

	// Billing Address
	"billing_name":     {Label: "Billing Name", Group: "Billing Address"},
	"billing_address1": {Label: "Address 1", Group: "Billing Address"},
	"billing_address2": {Label: "Address 2", Group: "Billing Address"},
	"billing_city":     {Label: "City", Group: "Billing Address"},
	"billing_state":    {Label: "State", Group: "Billing Address"},
	"billing_postcode": {Label: "Postcode", Group: "Billing Address"},
	"billing_country":  {Label: "Country", Group: "Billing Address"},

	// Shipping Address
	"shipping_name":     {Label: "Shipping Name", Group: "Shipping Address"},
	"shipping_address1": {Label: "Address 1", Group: "Shipping Address"},
	"shipping_address2": {Label: "Address 2", Group: "Shipping Address"},
	"shipping_city":     {Label: "City", Group: "Shipping Address"},
	"shipping_state":    {Label: "State", Group: "Shipping Address"},
	"shipping_postcode": {Label: "Postcode", Group: "Shipping Address"},
	"shipping_country":  {Label: "Country", Group: "Shipping Address"},

	// Delivery & Tracking
	"delivery_method":  {Label: "Delivery Method", Group: "Delivery"},
	"tracking_number":  {Label: "Tracking Number", Group: "Delivery"},
	"tracking_carrier": {Label: "Tracking Carrier", Group: "Delivery"},
	"tracking_url":     {Label: "Tracking URL", Group: "Delivery"},
	"fulfillment_note": {Label: "Fulfillment Note", Group: "Delivery"},

	// Item-level (each item becomes its own row when flattened)
	"item_name":          {Label: "Item Name", Group: "Item"},
	"item_sku":           {Label: "Item SKU", Group: "Item"},
	"item_variation":     {Label: "Variation", Group: "Item"},
	"item_qty":           {Label: "Qty", Group: "Item"},
	"item_unit_price":    {Label: "Unit Price", Group: "Item"},
	"item_line_subtotal": {Label: "Line Subtotal", Group: "Item"},
	"item_line_total":    {Label: "Line Total", Group: "Item"},
	"item_line_tax":      {Label: "Line Tax", Group: "Item"},

	// Attribution
	"source":     {Label: "Source", Group: "Attribution"},
	"medium":     {Label: "Medium", Group: "Attribution"},
	"campaign":   {Label: "Campaign", Group: "Attribution"},
	"client_id":  {Label: "Client ID", Group: "Attribution"},
	"session_id": {Label: "Session ID", Group: "Attribution"},
}

// IsValidKey returns true if key exists in ColumnRegistry.
func IsValidKey(key string) bool {
	_, ok := ColumnRegistry[key]
	return ok
}

// GroupOrder defines the display order for column groups in the UI.
var GroupOrder = []string{
	"Order",
	"Amounts",
	"Dates",
	"Customer",
	"Billing Address",
	"Shipping Address",
	"Delivery",
	"Item",
	"Attribution",
}
