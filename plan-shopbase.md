# Plan: ShopBase Integration

## Context

Woosaas hiện đang quản lý nhiều `site` theo từng `user`. Luồng WooCommerce đã có:

- `sites` để lưu website
- tracking script/API key cho từng site
- order sync vào các bảng `woo_orders`, `woo_order_items`, `woo_order_contacts`
- dashboard orders, contacts, revenue, retention, refunds

ShopBase có thể tích hợp theo 2 hướng:

- **Private app**: merchant tạo API key/password trong ShopBase admin cho từng store. Đây là hướng v1 nên làm trước vì đơn giản và phù hợp với thao tác add từng website.
- **Public app + OAuth**: dùng cho nhiều merchant cài app. Hướng này cần Partner Dashboard, OAuth, access token, token secret và có thể dùng cho v2.

Mục tiêu v1: cho phép user add website ShopBase vào Woosaas, tự verify store, cài tracking script nếu có quyền, sync order/checkout/customer/product cơ bản, nhận webhook realtime và hiển thị được trên dashboard hiện tại.

---

## Scope V1

### In Scope

- Add site platform `shopbase`
- Lưu ShopBase connection credentials an toàn
- Verify store qua ShopBase Admin API
- Lấy shop metadata: shop id, name, primary domain, currency, timezone, country
- Cài Woosaas tracking script qua ShopBase ScriptTag API
- Đăng ký webhook ShopBase
- Backfill dữ liệu:
  - orders
  - abandoned checkouts
  - customers
  - products/variants ở mức cần cho line items
- Realtime sync qua webhook:
  - orders/create
  - orders/updated
  - orders/paid
  - orders/cancelled
  - orders/fulfilled
  - orders/partially_fulfilled
  - orders/delete
  - refunds/create
  - fulfillments/create
  - fulfillments/update
  - checkouts/create
  - checkouts/update
  - checkouts/delete
  - carts/create
  - carts/update
  - products/create
  - products/update
  - products/delete
  - shop/update
  - app/uninstalled
- Mapping ShopBase orders vào dashboard Orders hiện tại
- Track frontend behavior bằng Woosaas JS script:
  - page view
  - product view
  - collection/page view nếu detect được URL
  - add to cart nếu hook được storefront event hoặc DOM
  - checkout started nếu redirect/URL pattern detect được
  - order status page view

### Out of Scope V1

- Public ShopBase app listing trên App Store
- Full OAuth install flow
- Tạo/sửa order ShopBase từ Woosaas
- Fulfillment management từ Woosaas
- Product management/editor trong Woosaas
- Inventory management
- Payment gateway integration

---

## ShopBase API Capabilities

### Authentication

V1 dùng private app:

- Merchant tạo private app trong ShopBase admin
- Merchant cung cấp:
  - shop domain, ví dụ `store.onshopbase.com`
  - API key
  - API password
- API call dùng HTTPS tới host của shop.

V2 public app:

- OAuth install
- Header `X-ShopBase-Access-Token`
- Header `X-ShopBase-Token-Secret`
- Optional IP whitelist

### Useful Endpoints

```text
GET  /admin/shop.json
GET  /admin/orders.json
GET  /admin/orders/count.json
GET  /admin/orders/{order_id}.json
GET  /admin/checkouts.json
GET  /admin/checkouts/count.json
GET  /admin/customers.json
GET  /admin/customers/count.json
GET  /admin/products.json
GET  /admin/products/count.json
GET  /admin/webhooks.json
POST /admin/webhooks.json
GET  /admin/script_tags.json
POST /admin/script_tags.json
```

### Webhook Topics

```text
carts/create
carts/update
checkouts/create
checkouts/update
checkouts/delete
orders/create
orders/updated
orders/paid
orders/cancelled
orders/fulfilled
orders/partially_fulfilled
orders/delete
order_transactions/create
refunds/create
fulfillments/create
fulfillments/update
products/create
products/update
products/delete
shop/update
app/uninstalled
```

Webhook receiver yêu cầu:

- HTTPS endpoint hợp lệ
- Response 2xx nhanh
- Verify HMAC bằng header `X-ShopBase-Hmac-SHA256`
- Queue xử lý async, không xử lý nặng trực tiếp trong request

---

## Data Model

### Sites

Hiện `sites` đang platform-agnostic ở mức domain/name/timezone/currency. Cần thêm platform metadata.

Migration:

```sql
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS platform VARCHAR(30) NOT NULL DEFAULT 'woocommerce',
  ADD COLUMN IF NOT EXISTS external_shop_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS platform_domain VARCHAR(255),
  ADD COLUMN IF NOT EXISTS primary_domain VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_sites_platform_external_shop
  ON sites(platform, external_shop_id);
```

Rules:

- Existing sites default `woocommerce`
- ShopBase sites có `platform = 'shopbase'`
- `domain` ưu tiên primary/custom domain nếu có
- `platform_domain` lưu `*.onshopbase.com`
- `external_shop_id` lưu ShopBase shop id

### Site Integrations

Không nên lưu credential trực tiếp trong `sites`.

Migration:

```sql
CREATE TABLE IF NOT EXISTS site_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  platform VARCHAR(30) NOT NULL,
  auth_type VARCHAR(30) NOT NULL,
  shop_domain VARCHAR(255) NOT NULL,
  api_key_encrypted TEXT,
  api_password_encrypted TEXT,
  access_token_encrypted TEXT,
  token_secret_encrypted TEXT,
  webhook_secret_encrypted TEXT,
  scopes TEXT[] DEFAULT '{}',
  status VARCHAR(30) NOT NULL DEFAULT 'connected',
  last_verified_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(site_id, platform)
);
```

V1:

- `platform = 'shopbase'`
- `auth_type = 'private_app'`
- encrypt `api_key`, `api_password`

V2:

- `auth_type = 'oauth'`
- encrypt `access_token`, `token_secret`

### ShopBase Sync State

Tách state riêng để không trộn với `woo_order_sync_state`.

```sql
CREATE TABLE IF NOT EXISTS shopbase_sync_state (
  site_id UUID PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
  order_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  checkout_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  customer_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  product_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(30) NOT NULL DEFAULT 'idle',
  last_order_updated_at TIMESTAMPTZ,
  last_checkout_updated_at TIMESTAMPTZ,
  last_customer_updated_at TIMESTAMPTZ,
  last_product_updated_at TIMESTAMPTZ,
  last_webhook_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  backfill_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Orders

Có 2 lựa chọn.

Option A, nhanh cho v1:

- Tái sử dụng bảng `woo_orders` và `woo_order_items`
- `woo_order_id` lưu ShopBase order id dạng string
- Thêm `source_platform`

Migration:

```sql
ALTER TABLE woo_orders
  ADD COLUMN IF NOT EXISTS source_platform VARCHAR(30) NOT NULL DEFAULT 'woocommerce',
  ADD COLUMN IF NOT EXISTS external_order_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS checkout_token VARCHAR(255),
  ADD COLUMN IF NOT EXISTS cart_token VARCHAR(255),
  ADD COLUMN IF NOT EXISTS order_status_url TEXT,
  ADD COLUMN IF NOT EXISTS payment_gateway TEXT,
  ADD COLUMN IF NOT EXISTS referring_site TEXT;

ALTER TABLE woo_order_items
  ADD COLUMN IF NOT EXISTS source_platform VARCHAR(30) NOT NULL DEFAULT 'woocommerce';
```

Option B, sạch hơn cho dài hạn:

- Rename logical layer từ `woo_orders` sang `commerce_orders`
- Tạo view backward-compatible cho dashboard cũ
- Tốn công hơn, nên để phase sau.

Recommendation v1: dùng Option A để giảm blast radius. Khi support thêm Shopify/BigCommerce thì refactor sang `commerce_orders`.

### Abandoned Checkouts

ShopBase có checkout API/webhook riêng, nên cần bảng mới.

```sql
CREATE TABLE IF NOT EXISTS commerce_checkouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  platform VARCHAR(30) NOT NULL,
  external_checkout_id VARCHAR(100) NOT NULL,
  token VARCHAR(255),
  cart_token VARCHAR(255),
  name VARCHAR(100),
  email VARCHAR(255),
  phone VARCHAR(100),
  currency VARCHAR(10),
  subtotal_amount NUMERIC(18, 2) DEFAULT 0,
  shipping_amount NUMERIC(18, 2) DEFAULT 0,
  tax_amount NUMERIC(18, 2) DEFAULT 0,
  discount_amount NUMERIC(18, 2) DEFAULT 0,
  total_amount NUMERIC(18, 2) DEFAULT 0,
  recovery_status VARCHAR(50),
  email_status VARCHAR(50),
  sms_status VARCHAR(50),
  checkout_url TEXT,
  shipping_method TEXT,
  shipping_address_json JSONB DEFAULT '{}'::jsonb,
  billing_address_json JSONB DEFAULT '{}'::jsonb,
  line_items_json JSONB DEFAULT '[]'::jsonb,
  raw_checkout_json JSONB DEFAULT '{}'::jsonb,
  created_at_platform TIMESTAMPTZ,
  updated_at_platform TIMESTAMPTZ,
  abandoned_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(site_id, platform, external_checkout_id)
);
```

---

## Backend Packages

### New Package: ShopBase Client

```text
api/internal/shopbase/client.go
api/internal/shopbase/types.go
api/internal/shopbase/mapper.go
api/internal/shopbase/webhooks.go
api/internal/shopbase/service.go
api/internal/shopbase/repository.go
```

Responsibilities:

- Build authenticated requests
- Normalize shop domain
- Handle pagination/limit
- Parse ShopBase timestamps
- Map ShopBase DTOs to internal models
- Register/list script tags
- Register/list webhooks
- Verify webhook HMAC

Client methods:

```go
type Client struct {
    baseURL string
    auth    Auth
    http    *http.Client
}

func (c *Client) GetShop(ctx context.Context) (*Shop, error)
func (c *Client) ListOrders(ctx context.Context, params ListParams) ([]Order, error)
func (c *Client) GetOrder(ctx context.Context, id string) (*Order, error)
func (c *Client) ListCheckouts(ctx context.Context, params ListParams) ([]Checkout, error)
func (c *Client) ListCustomers(ctx context.Context, params ListParams) ([]Customer, error)
func (c *Client) ListProducts(ctx context.Context, params ListParams) ([]Product, error)
func (c *Client) ListWebhooks(ctx context.Context) ([]Webhook, error)
func (c *Client) CreateWebhook(ctx context.Context, topic, address string) (*Webhook, error)
func (c *Client) ListScriptTags(ctx context.Context) ([]ScriptTag, error)
func (c *Client) CreateScriptTag(ctx context.Context, src, displayScope string) (*ScriptTag, error)
```

### Credential Encryption

Add app secret:

```text
INTEGRATION_ENCRYPTION_KEY=
```

Requirements:

- AES-GCM or libsodium equivalent
- Never log credential values
- Return masked credential status only

Helpers:

```text
api/internal/crypto/secrets.go
```

### Site Integration Service

Extend sites API or add integration API.

Recommended endpoints:

```http
POST /api/v1/sites/shopbase/verify
POST /api/v1/sites/shopbase
GET  /api/v1/sites/:site_id/integration
PUT  /api/v1/sites/:site_id/integration/shopbase
POST /api/v1/sites/:site_id/integration/shopbase/install-script
POST /api/v1/sites/:site_id/integration/shopbase/register-webhooks
POST /api/v1/sites/:site_id/integration/shopbase/backfill
```

Request examples:

```json
{
  "shop_domain": "example.onshopbase.com",
  "api_key": "private_app_key",
  "api_password": "private_app_password"
}
```

Verify response:

```json
{
  "ok": true,
  "shop": {
    "external_shop_id": "107333978",
    "name": "Example Store",
    "domain": "example.com",
    "platform_domain": "example.onshopbase.com",
    "currency": "USD",
    "timezone": "America/Los_Angeles"
  }
}
```

---

## Webhook Design

### Endpoint

```http
POST /api/v1/shopbase/webhooks/:site_id
```

Headers:

```text
X-ShopBase-Hmac-SHA256
X-ShopBase-Topic
```

Behavior:

1. Read raw body
2. Load site integration by `site_id`
3. Verify HMAC with stored webhook secret
4. Write event to queue
5. Return 200 fast

Queue payload:

```json
{
  "site_id": "uuid",
  "platform": "shopbase",
  "topic": "orders/create",
  "payload": {},
  "received_at": "2026-05-15T00:00:00Z"
}
```

### Worker

Add worker consumer:

```text
shopbase:webhook_events
shopbase:backfill_jobs
```

Processing rules:

- `orders/*`: upsert order snapshot
- `refunds/create`: refresh order detail if order id exists
- `fulfillments/*`: refresh order detail or update fulfillment fields
- `checkouts/*`: upsert checkout snapshot
- `products/*`: upsert/delete lightweight product cache if implemented
- `shop/update`: refresh site metadata
- `app/uninstalled`: mark integration disconnected and disable sync

Idempotency:

- Use unique keys `(site_id, platform, external_id)`
- Upsert by external id
- Ignore stale payload if `updated_at` older than stored row

---

## Mapping ShopBase Order To Woosaas

### ShopBase Field Mapping

```text
OrderDto.id                         -> woo_orders.woo_order_id
OrderDto.name/order_number           -> external_order_name
OrderDto.email                       -> customer_email
OrderDto.phone                       -> customer_phone
OrderDto.currency                    -> currency
OrderDto.financial_status            -> payment_status
OrderDto.fulfillment_status          -> fulfillment_status
OrderDto.total_price                 -> total_amount
OrderDto.subtotal_price              -> subtotal_amount
OrderDto.total_discounts             -> discount_amount
OrderDto.shipping_fee/total_shipping -> shipping_amount
OrderDto.total_tax                   -> tax_amount
OrderDto.shipping_lines[0].title     -> delivery_method
OrderDto.billing_address             -> billing_address_json
OrderDto.shipping_address            -> shipping_address_json
OrderDto.line_items                  -> woo_order_items
OrderDto.checkout_token              -> checkout_token
OrderDto.cart_token                  -> cart_token
OrderDto.order_status_url            -> order_status_url
OrderDto.payment_gateway             -> payment_gateway
OrderDto.referring_site              -> referring_site
OrderDto.created_at                  -> created_at_woo
OrderDto.processed_at                -> paid_at_woo when paid
OrderDto.updated_at                  -> modified_at_woo
OrderDto.cancelled_at                -> deleted_at_woo or cancellation marker
raw order                            -> raw_order_json
```

### Status Normalization

Do not over-normalize in v1. Store raw ShopBase status strings and let dashboard render them.

Optional normalized helpers:

```text
financial_status paid/pending/refunded/voided -> payment_status
fulfillment_status fulfilled/partial/null     -> fulfillment_status
cancelled_at not null                         -> status cancelled
```

### Delivery Method

Use first available shipping method:

```text
shipping_lines[0].title
shipping_lines[0].code
shipping_method
shipping_name
```

For order list Delivery column, return `delivery_method`.

---

## Tracking Script

### ScriptTag Install

When user clicks install:

```http
POST /admin/script_tags.json
```

Payload:

```json
{
  "script_tag": {
    "event": "onload",
    "src": "https://app.woosaas.com/tracker.js?site_id={site_id}",
    "display_scope": "all"
  }
}
```

Rules:

- Check existing script tags by `src` before creating
- Use `display_scope = all` to include storefront and order status page
- If permission missing, show manual install fallback

### Frontend Events From Script

Minimum events:

```text
page_view
product_view
collection_view
add_to_cart
checkout_started
order_status_view
```

Detection strategy:

- URL path pattern
- DOM data attributes where available
- Existing ShopBase storefront globals if present
- Fallback: generic page view only

Important:

- Do not rely on JS script for completed orders. Orders must come from API/webhook.
- Use script event `client_id`/session id to connect visits to orders where possible by checkout/cart token, email hash, or attribution fields.

---

## Dashboard UX

### Add Website Flow

Update `/dashboard/sites` add modal/page:

1. Choose platform:
   - WooCommerce
   - ShopBase
2. For ShopBase:
   - Shop domain
   - API key
   - API password
3. Click `Verify`
4. Show detected store:
   - name
   - primary domain
   - currency
   - timezone
5. Click `Connect`
6. Post-connect checklist:
   - Install tracking script
   - Register webhooks
   - Start backfill

### Site Detail

Add integration status panel:

```text
Platform: ShopBase
Connection: Connected / Error / Disconnected
Tracking script: Installed / Missing / Permission required
Webhooks: Active / Missing / Error
Last sync: timestamp
Backfill: idle/running/completed/error
```

### Orders Page

Keep existing page.

Required:

- Orders list works for `platform = shopbase`
- Delivery column uses `delivery_method`
- Payment/Fulfillment badges render unknown raw values gracefully
- Order detail shows source/platform metadata when useful

### Health Page

Add ShopBase-specific checks:

- API credentials valid
- Shop metadata fetch OK
- Script tag installed
- Webhooks registered
- Last webhook received
- Backfill status
- Last API reconciliation success

---

## API Routes Summary

### Dashboard Authenticated Routes

```http
POST /api/v1/sites/shopbase/verify
POST /api/v1/sites/shopbase
GET  /api/v1/sites/:site_id/integration
PUT  /api/v1/sites/:site_id/integration/shopbase
POST /api/v1/sites/:site_id/integration/shopbase/install-script
POST /api/v1/sites/:site_id/integration/shopbase/register-webhooks
POST /api/v1/sites/:site_id/integration/shopbase/backfill
GET  /api/v1/sites/:site_id/integration/shopbase/sync-state
```

### Public Webhook Route

```http
POST /api/v1/shopbase/webhooks/:site_id
```

---

## Implementation Phases

### Phase 1: Data Foundation

- Add `platform` and external shop fields to `sites`
- Add `site_integrations`
- Add `shopbase_sync_state`
- Add `commerce_checkouts`
- Add encryption helper for integration credentials
- Update Go models for site platform/integration status

Acceptance:

- Existing WooCommerce sites continue working
- Existing site list/dashboard unaffected
- New migrations run cleanly

### Phase 2: ShopBase Client

- Add `api/internal/shopbase`
- Implement private app auth
- Implement `GetShop`
- Implement list/create script tags
- Implement list/create webhooks
- Implement list orders/checkouts/customers/products
- Add unit tests with mocked HTTP server

Acceptance:

- Client can verify a test ShopBase credential
- Client handles non-2xx with useful errors
- Client never logs secrets

### Phase 3: Connect ShopBase Site

- Add verify endpoint
- Add create ShopBase site endpoint
- Save encrypted credentials
- Create sync state row
- Use ShopBase shop metadata for site name/domain/timezone/currency
- Add dashboard UI platform selection and ShopBase credential form

Acceptance:

- User can add ShopBase website
- Site appears in website switcher
- Site detail shows platform `ShopBase`

### Phase 4: Tracking Script Install

- Add backend install-script endpoint
- Detect existing script tags
- Create script tag with Woosaas tracker URL
- Add dashboard action/status
- Add manual fallback snippet if API permission missing

Acceptance:

- Clicking install creates one script tag only
- Re-click is idempotent
- Health page reports installed/missing

### Phase 5: Webhooks

- Add webhook registration endpoint
- Add public webhook receiver
- Add HMAC verification
- Queue webhook events
- Add worker consumer
- Add idempotency and raw event logging if needed

Acceptance:

- Webhook registration creates required topics
- Test webhook request is accepted only with valid HMAC
- Invalid HMAC returns 401/403
- Worker processes queued events

### Phase 6: Orders Sync

- Implement ShopBase order mapper
- Upsert mapped orders into existing order tables
- Add `source_platform = shopbase`
- Sync line items
- Sync derived contacts
- Map delivery method from shipping data
- Add backfill endpoint/job
- Add reconciliation by `updated_at_min`

Acceptance:

- Backfilled ShopBase orders appear in Orders page
- Delivery column shows shipping method
- Order detail shows line items, customer, totals, address
- Re-running backfill does not duplicate orders

### Phase 7: Checkouts And Carts

- Implement checkout mapper
- Upsert `commerce_checkouts`
- Process checkout webhooks
- Add minimal abandoned checkout dashboard or reuse existing abandonment metrics if compatible
- Link checkout/order where token matches

Acceptance:

- Abandoned checkouts are stored
- Recovered/completed checkout updates correctly
- Checkout totals and shipping method are available

### Phase 8: Products And Attribution

- Store lightweight product cache if needed for product reports
- Map product/variant ids from order line items
- Link script events to order attribution where possible:
  - session id
  - client id
  - cart token
  - checkout token
  - referring site
  - UTM fields from tracking script

Acceptance:

- Product reports include ShopBase order line items
- Attribution fields are present for ShopBase orders when available

### Phase 9: Hardening

- Rate limit ShopBase API calls
- Retry transient API errors
- Store last error and last success timestamps
- Add sync locks to avoid duplicate backfill
- Add observability logs with site id/platform, no secrets
- Add integration tests for mapper/repository
- Add dashboard empty/error/loading states

Acceptance:

- Backfill handles partial failure
- Webhook outage can be recovered by reconciliation job
- Build and tests pass

---

## Testing Checklist

### Backend

```text
go test ./internal/shopbase ./internal/sites ./internal/orders ./pkg/models
```

Required tests:

- ShopBase client auth header/basic auth behavior
- Shop domain normalization
- Shop metadata mapping
- Order mapper totals/status/address/line items
- Delivery method selection
- Checkout mapper
- Webhook HMAC validation
- Webhook idempotency
- Credential encryption/decryption

### Dashboard

```text
npm run build
```

Manual QA:

- Add ShopBase site with invalid credentials shows clear error
- Add ShopBase site with valid credentials succeeds
- Existing WooCommerce add site flow still works
- Install tracking script is idempotent
- Register webhooks is idempotent
- Orders page shows ShopBase order
- Delivery column shows method
- Health page reflects ShopBase integration state

### End-To-End

1. Create ShopBase private app
2. Add ShopBase site in Woosaas
3. Verify metadata imported
4. Install tracking script
5. Register webhooks
6. Start backfill
7. Create test order in ShopBase
8. Confirm webhook received
9. Confirm order appears in dashboard
10. Confirm Delivery column shows shipping method
11. Confirm product/order/customer analytics update

---

## Security Notes

- Store ShopBase credentials encrypted only
- Never expose API password/access token to dashboard after save
- Mask connection fields in API responses
- Verify webhook HMAC before enqueue
- Use HTTPS webhook URL only
- Add audit log for credential update/connect/disconnect
- Support disconnect:
  - mark integration disconnected
  - optionally remove webhooks/script tag if API access still valid

---

## Open Questions

- Woosaas production tracker URL chính thức là gì?
- V1 chỉ private app hay cần public OAuth ngay?
- Có cần migrate table name từ `woo_orders` sang `commerce_orders` trước khi thêm ShopBase không?
- ShopBase private app có quyền `write_script_tags` và `write_webhooks` trong tất cả plan không?
- Có cần sync historical products đầy đủ hay chỉ line items từ orders là đủ cho v1?
- Abandoned checkout sẽ có UI riêng hay gộp vào existing abandonment page?
- Có cần cho user chọn sync options khi connect không?

---

## Recommended V1 Delivery

Làm theo thứ tự ngắn nhất để có giá trị:

1. Add platform/integration schema
2. Build ShopBase client + verify store
3. Add ShopBase site flow
4. Install tracking script
5. Register webhooks
6. Sync orders + delivery method
7. Backfill orders
8. Add checkouts
9. Add health/status UI

V1 success criteria:

- User add được ShopBase website
- Woosaas tracking script chạy trên storefront
- Order ShopBase sync vào dashboard
- Cột Delivery hiển thị shipping method
- Webhook realtime hoạt động
- Backfill/reconciliation chạy được khi miss webhook
