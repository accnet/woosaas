# Tasks: ShopBase Integration V1

> Theo thứ tự delivery: Phase 1 → 8. Mỗi task có file path cụ thể và acceptance check.

---

## Phase 1: Data Foundation

### 1.1 Migration — sites + site_integrations + shopbase_sync_state

**File:** `api/migrations_postgres/008_shopbase_platform.sql`

```sql
-- Bước 1: Thêm cột platform vào sites
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS platform VARCHAR(30) NOT NULL DEFAULT 'woocommerce',
  ADD COLUMN IF NOT EXISTS external_shop_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS platform_domain VARCHAR(255),
  ADD COLUMN IF NOT EXISTS primary_domain VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_sites_platform_external_shop
  ON sites(platform, external_shop_id);

-- Bước 2: Bảng site_integrations (lưu credential mã hóa)
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

-- Bước 3: Bảng shopbase_sync_state
CREATE TABLE IF NOT EXISTS shopbase_sync_state (
  site_id UUID PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
  order_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  checkout_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  customer_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  product_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(30) NOT NULL DEFAULT 'idle',
  last_order_updated_at TIMESTAMPTZ,
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

- [ ] Tạo file migration
- [ ] Chạy `go run ./cmd/migrate` kiểm tra không lỗi
- [ ] Existing WooCommerce sites vẫn hoạt động (platform default = 'woocommerce')

---

### 1.2 Migration — Rename woo_orders → commerce_orders (Option B)

**File:** `api/migrations_postgres/009_commerce_orders.sql`

```sql
-- Rename tables
ALTER TABLE woo_orders RENAME TO commerce_orders;
ALTER TABLE woo_order_items RENAME TO commerce_order_items;

-- Add ShopBase fields
ALTER TABLE commerce_orders
  ADD COLUMN IF NOT EXISTS source_platform VARCHAR(30) NOT NULL DEFAULT 'woocommerce',
  ADD COLUMN IF NOT EXISTS external_order_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS checkout_token VARCHAR(255),
  ADD COLUMN IF NOT EXISTS cart_token VARCHAR(255),
  ADD COLUMN IF NOT EXISTS order_status_url TEXT,
  ADD COLUMN IF NOT EXISTS payment_gateway TEXT,
  ADD COLUMN IF NOT EXISTS referring_site TEXT;

ALTER TABLE commerce_order_items
  ADD COLUMN IF NOT EXISTS source_platform VARCHAR(30) NOT NULL DEFAULT 'woocommerce';

-- Backward compat views cho code WooCommerce cũ
CREATE OR REPLACE VIEW woo_orders AS
  SELECT * FROM commerce_orders WHERE source_platform = 'woocommerce';

CREATE OR REPLACE VIEW woo_order_items AS
  SELECT * FROM commerce_order_items WHERE source_platform = 'woocommerce';
```

- [ ] Tạo file migration
- [ ] Update tất cả SQL query trong `api/internal/orders/repository.go` từ `woo_orders` → `commerce_orders`, `woo_order_items` → `commerce_order_items`
- [ ] Kiểm tra `api/internal/worker/consumer.go` — cập nhật table name nếu có hardcode
- [ ] Chạy existing tests: `go test ./internal/orders/...`
- [ ] WooCommerce order sync vẫn hoạt động qua backward-compat views

---

### 1.3 Go Models — cập nhật Site + thêm ShopBase models

**File:** `api/pkg/models/models.go`

- [ ] Thêm fields vào `Site` struct:
  ```go
  Platform         string  `json:"platform" db:"platform"`
  ExternalShopID   string  `json:"external_shop_id,omitempty" db:"external_shop_id"`
  PlatformDomain   string  `json:"platform_domain,omitempty" db:"platform_domain"`
  PrimaryDomain    string  `json:"primary_domain,omitempty" db:"primary_domain"`
  ```

**File mới:** `api/pkg/models/shopbase.go`

- [ ] Tạo struct `SiteIntegration`:
  ```go
  type SiteIntegration struct {
      ID             string     `json:"id"`
      SiteID         string     `json:"site_id"`
      Platform       string     `json:"platform"`
      AuthType       string     `json:"auth_type"`
      ShopDomain     string     `json:"shop_domain"`
      Status         string     `json:"status"`
      LastVerifiedAt *time.Time `json:"last_verified_at,omitempty"`
      LastError      string     `json:"last_error,omitempty"`
      CreatedAt      time.Time  `json:"created_at"`
      UpdatedAt      time.Time  `json:"updated_at"`
      // Không bao giờ expose encrypted fields ra JSON
  }
  ```
- [ ] Tạo struct `ShopBaseSyncState`
- [ ] Tạo struct `ShopBaseVerifyRequest` `{ ShopDomain, APIKey, APIPassword, SyncOptions }`
- [ ] Tạo struct `ShopBaseVerifyResponse` `{ OK bool, Shop ShopMetadata }`
- [ ] Tạo struct `ShopMetadata` `{ ExternalShopID, Name, Domain, PlatformDomain, Currency, Timezone }`
- [ ] Tạo struct `ShopBaseConnectRequest` (embed `ShopBaseVerifyRequest` + `SyncOptions`)

---

### 1.4 Crypto Helper — mã hóa credentials

**File mới:** `api/internal/crypto/secrets.go`

- [ ] Implement `Encrypt(plaintext string, key []byte) (string, error)` dùng AES-256-GCM
- [ ] Implement `Decrypt(ciphertext string, key []byte) (string, error)`
- [ ] Key được load từ env `INTEGRATION_ENCRYPTION_KEY` (32 bytes base64)
- [ ] Thêm `IntegrationEncryptionKey string` vào `Config` struct trong `api/internal/config/config.go`
- [ ] Không bao giờ log plaintext credential
- [ ] Unit test: encrypt → decrypt round trip, wrong key returns error

---

## Phase 2: ShopBase Client

**Package mới:** `api/internal/shopbase/`

### 2.1 Types

**File:** `api/internal/shopbase/types.go`

- [ ] `Auth` struct: `{ APIKey, APIPassword string }`
- [ ] `Shop` DTO (map từ `/admin/shop.json`)
- [ ] `Order` DTO (đủ fields để map sang `WooOrderInput`):
  - `ID`, `Name`, `OrderNumber`, `Email`, `Phone`, `Currency`
  - `FinancialStatus`, `FulfillmentStatus`
  - `TotalPrice`, `SubtotalPrice`, `TotalDiscounts`, `TotalShipping`, `TotalTax`
  - `ShippingLines []ShippingLine`
  - `BillingAddress`, `ShippingAddress`
  - `LineItems []LineItem`
  - `CheckoutToken`, `CartToken`, `OrderStatusURL`
  - `PaymentGateway`, `ReferringSite`
  - `CreatedAt`, `ProcessedAt`, `UpdatedAt`, `CancelledAt`
  - `Refunds []Refund`
- [ ] `LineItem` DTO: `ID`, `ProductID`, `VariantID`, `SKU`, `Title`, `Quantity`, `Price`, `TotalDiscount`
- [ ] `Webhook` DTO: `ID`, `Topic`, `Address`, `CreatedAt`
- [ ] `ScriptTag` DTO: `ID`, `Src`, `Event`, `DisplayScope`
- [ ] `ListParams` struct: `{ Limit, Page int; UpdatedAtMin *time.Time; Status string }`
- [ ] `ListResponse[T]` generic wrapper hoặc separate list structs

### 2.2 Client

**File:** `api/internal/shopbase/client.go`

- [ ] `Client` struct: `{ baseURL string; auth Auth; http *http.Client }`
- [ ] `NewClient(shopDomain string, auth Auth) *Client` — normalize domain (thêm `https://`, strip trailing slash)
- [ ] `func (c *Client) GetShop(ctx) (*Shop, error)`
- [ ] `func (c *Client) ListOrders(ctx, ListParams) ([]Order, int, error)` — trả về total count
- [ ] `func (c *Client) GetOrder(ctx, id string) (*Order, error)`
- [ ] `func (c *Client) ListCustomers(ctx, ListParams) ([]Customer, int, error)`
- [ ] `func (c *Client) ListProducts(ctx, ListParams) ([]Product, int, error)`
- [ ] `func (c *Client) ListWebhooks(ctx) ([]Webhook, error)`
- [ ] `func (c *Client) CreateWebhook(ctx, topic, address string) (*Webhook, error)`
- [ ] `func (c *Client) ListScriptTags(ctx) ([]ScriptTag, error)`
- [ ] `func (c *Client) CreateScriptTag(ctx, src, displayScope string) (*ScriptTag, error)`
- [ ] Dùng HTTP Basic Auth: `apiKey:apiPassword`
- [ ] Tất cả non-2xx response trả về typed error có status code
- [ ] 429 rate limit → trả về `ErrRateLimited`
- [ ] Timeout mặc định 30s
- [ ] Không log request body hoặc Authorization header

### 2.3 Mapper

**File:** `api/internal/shopbase/mapper.go`

- [ ] `func MapOrderToInput(o Order, siteID string) models.WooOrderInput`
  - Map đầy đủ theo bảng field mapping trong `plan-shopbase.md`
  - `source_platform = "shopbase"` (thêm field này vào `WooOrderInput`)
  - `DeliveryMethod` lấy từ `ShippingLines[0].Title` nếu có
  - Parse `CreatedAt`, `ProcessedAt` sang `*time.Time`
  - `paid_at_woo` = `ProcessedAt` khi `financial_status == "paid"`
- [ ] `func MapShopToMetadata(s Shop) models.ShopMetadata`
- [ ] Unit test: map order với đủ các trường hợp (order thường, order refund, order cancelled)

### 2.4 Webhook HMAC

**File:** `api/internal/shopbase/webhooks.go`

- [ ] `func VerifyHMAC(rawBody []byte, hmacHeader string, secret string) bool`
  - Dùng HMAC-SHA256, base64 encode, constant-time compare
- [ ] Unit test: valid HMAC pass, tampered body fail, wrong secret fail

### 2.5 Tests

**File:** `api/internal/shopbase/client_test.go`

- [ ] Mock HTTP server (`httptest.NewServer`)
- [ ] Test `GetShop` parse response đúng
- [ ] Test `ListOrders` pagination
- [ ] Test non-2xx error handling
- [ ] Test Basic Auth header được gửi đúng (không log)
- [ ] `go test ./internal/shopbase/...` pass

---

## Phase 3: Connect ShopBase Site

### 3.1 Repository

**File:** `api/internal/sites/repository.go` (extend)

- [ ] `CreateShopBaseSite(ctx, userID string, meta ShopMetadata, integration SiteIntegrationInput) (*Site, error)`
  - Insert vào `sites` với platform = 'shopbase'
  - Insert vào `site_integrations` với credential đã encrypt
  - Insert vào `shopbase_sync_state` với sync options từ request
  - Wrap trong transaction
- [ ] `GetSiteIntegration(ctx, siteID, platform string) (*SiteIntegration, error)` — không trả về encrypted fields
- [ ] `UpdateSiteIntegration(ctx, siteID string, ...) error`
- [ ] `GetShopBaseSyncState(ctx, siteID string) (*ShopBaseSyncState, error)`
- [ ] `UpdateShopBaseSyncState(ctx, siteID string, updates ...) error`
- [ ] Update `SiteRepository` interface trong `api/internal/sites/ports.go` với các method mới

### 3.2 Handler

**File mới:** `api/internal/api/handlers/shopbase.go`

- [ ] `ShopBaseHandler` struct: `{ repo SiteRepository; crypto *crypto.Service }`
- [ ] `POST /api/v1/sites/shopbase/verify`:
  1. Bind `ShopBaseVerifyRequest`
  2. Validate shop_domain format
  3. Tạo `shopbase.Client` với credentials
  4. Gọi `client.GetShop()`
  5. Return `ShopBaseVerifyResponse` (không lưu gì)
  6. Error rõ ràng: invalid credentials, shop not found, network error
- [ ] `POST /api/v1/sites/shopbase`:
  1. Bind `ShopBaseConnectRequest`
  2. Verify credentials (gọi GetShop)
  3. Encrypt api_key + api_password
  4. Tạo webhook secret ngẫu nhiên (32 bytes)
  5. Gọi `CreateShopBaseSite`
  6. Return site object (không có credentials)
- [ ] `GET /api/v1/sites/:site_id/integration`:
  - Return `SiteIntegration` với masked credentials (chỉ hiện prefix/status)
- [ ] `GET /api/v1/sites/:site_id/integration/shopbase/sync-state`

### 3.3 Router

**File:** `api/internal/api/router.go`

- [ ] Inject `ShopBaseHandler` vào `Router` struct
- [ ] Đăng ký routes trong `Setup()`:
  ```
  POST  /api/v1/sites/shopbase/verify          (auth required)
  POST  /api/v1/sites/shopbase                 (auth required)
  GET   /api/v1/sites/:site_id/integration     (auth + site access)
  GET   /api/v1/sites/:site_id/integration/shopbase/sync-state
  ```

### 3.4 Dashboard UI — Add Site Flow

**File:** `dashboard/src/app/dashboard/[site_id]/settings/` hoặc sites page

- [ ] Cập nhật modal/page Add Website:
  - Step 1: Chọn platform (WooCommerce / ShopBase)
  - Step 2 (ShopBase): Form nhập `shop_domain`, `api_key`, `api_password`
  - Step 3: Button "Verify" → gọi `POST /api/v1/sites/shopbase/verify` → hiển thị shop name/domain/currency
  - Step 4: Sync options checkboxes (Orders ✓, Customers ✓, Products ✓)
  - Step 5: Button "Connect" → gọi `POST /api/v1/sites/shopbase`
- [ ] Existing WooCommerce add site flow không bị ảnh hưởng
- [ ] Error states: invalid credentials, domain format error, network error

---

## Phase 4: Tracking Script Install

### 4.1 Handler

**File:** `api/internal/api/handlers/shopbase.go` (thêm vào)

- [ ] `POST /api/v1/sites/:site_id/integration/shopbase/install-script`:
  1. Load `SiteIntegration` → decrypt credentials
  2. Tạo ShopBase client
  3. `client.ListScriptTags()` → check nếu Woosaas script đã tồn tại (match by src prefix)
  4. Nếu chưa có → `client.CreateScriptTag(trackerURL, "all")`
  5. Return `{ installed: true, script_tag_id: "..." }` hoặc `{ installed: true, already_existed: true }`
  6. Nếu 403 (permission missing) → return `{ installed: false, reason: "permission_required", fallback_snippet: "..." }`
- [ ] `trackerURL` = `https://<TRACKER_DOMAIN>/tracker.js?site_id={site_id}` từ env `TRACKER_BASE_URL`
- [ ] Thêm `TrackerBaseURL string` vào `Config`
- [ ] Idempotent: gọi lại không tạo duplicate

### 4.2 Router

- [ ] Đăng ký route `POST /api/v1/sites/:site_id/integration/shopbase/install-script`

### 4.3 Dashboard UI

- [ ] Post-connect checklist item "Install tracking script" → gọi endpoint
- [ ] Hiển thị trạng thái: Installed / Missing / Permission required + manual snippet fallback

---

## Phase 5: Webhooks

### 5.1 Register Webhooks Handler

**File:** `api/internal/api/handlers/shopbase.go`

- [ ] `POST /api/v1/sites/:site_id/integration/shopbase/register-webhooks`:
  1. Load integration + decrypt credentials
  2. `client.ListWebhooks()` → lấy danh sách topic đã có
  3. Với mỗi topic trong danh sách required (từ plan) chưa tồn tại → `client.CreateWebhook(topic, webhookURL)`
  4. `webhookURL` = `https://<API_DOMAIN>/api/v1/shopbase/webhooks/{site_id}`
  5. Return `{ registered: N, already_existed: M, topics: [...] }`
- [ ] Required topics V1:
  ```
  orders/create, orders/updated, orders/paid, orders/cancelled,
  orders/fulfilled, orders/partially_fulfilled, orders/delete,
  refunds/create, fulfillments/create, fulfillments/update,
  products/create, products/update, products/delete,
  shop/update, app/uninstalled
  ```
- [ ] Idempotent

### 5.2 Webhook Receiver

**File mới:** `api/internal/api/handlers/shopbase_webhook.go`

- [ ] `POST /api/v1/shopbase/webhooks/:site_id` (public, không cần auth):
  1. Đọc raw body (trước khi parse JSON)
  2. Lấy `X-ShopBase-Hmac-SHA256` và `X-ShopBase-Topic` header
  3. Load `SiteIntegration` by `site_id` → decrypt `webhook_secret`
  4. `shopbase.VerifyHMAC(rawBody, hmacHeader, secret)` → nếu fail → 401
  5. Enqueue vào Redis stream `shopbase:webhook_events`:
     ```json
     { "site_id": "...", "platform": "shopbase", "topic": "orders/create",
       "payload": {...}, "received_at": "..." }
     ```
  6. Return 200 ngay

### 5.3 Worker Consumer — ShopBase

**File mới:** `api/internal/worker/shopbase_consumer.go`

- [ ] `ShopBaseConsumer` struct: `{ redis *redis.Client; orderSvc *orders.Service; repo *sites.Repository }`
- [ ] Đọc từ stream `shopbase:webhook_events`
- [ ] Routing theo topic:
  - `orders/*`, `refunds/create`, `fulfillments/*` → `handleOrderEvent()`
  - `products/*` → `handleProductEvent()` (bỏ qua trong V1 nếu chưa có product cache)
  - `shop/update` → refresh site metadata
  - `app/uninstalled` → mark integration status = 'disconnected', disable sync
- [ ] `handleOrderEvent()`:
  - Parse `OrderDto` từ payload
  - `shopbase.MapOrderToInput()` → `WooOrderInput`
  - `orderSvc.UpsertOrderSnapshot()`
  - Update `shopbase_sync_state.last_webhook_at`
- [ ] Idempotency: `UpsertOrderSnapshot` đã dùng `ON CONFLICT (site_id, woo_order_id)` → cần update query để dùng `commerce_orders`
- [ ] Thêm `ShopBaseConsumer` vào `cmd/worker/main.go`

### 5.4 Router — Public Webhook Route

**File:** `api/internal/api/router.go`

- [ ] Đăng ký route public (không qua auth middleware):
  `POST /api/v1/shopbase/webhooks/:site_id`

---

## Phase 6: Orders Sync

### 6.1 Update WooOrderInput model

**File:** `api/pkg/models/orders.go`

- [ ] Thêm field `SourcePlatform string` vào `WooOrderInput`
- [ ] Thêm field `ExternalOrderName string` vào `WooOrderInput`

### 6.2 Update Repository — commerce_orders

**File:** `api/internal/orders/repository.go`

- [ ] Cập nhật `UpsertOrderSnapshot` để:
  - Dùng table `commerce_orders` / `commerce_order_items` (thay vì `woo_orders`)
  - Ghi `source_platform` từ `WooOrderInput.SourcePlatform`
  - Ghi `external_order_name`
  - Ghi `checkout_token`, `cart_token`, `order_status_url`, `payment_gateway`, `referring_site`
- [ ] `ListOrders` — thêm filter `source_platform` vào `ListOrdersParams` nếu cần

### 6.3 Backfill Handler

**File:** `api/internal/api/handlers/shopbase.go`

- [ ] `POST /api/v1/sites/:site_id/integration/shopbase/backfill`:
  1. Load integration → decrypt credentials
  2. Enqueue job vào Redis stream `shopbase:backfill_jobs`:
     ```json
     { "site_id": "...", "type": "orders", "from": null }
     ```
  3. Return `{ started: true }`
  4. Update `shopbase_sync_state.status = 'running'`

### 6.4 Backfill Worker

**File:** `api/internal/worker/shopbase_consumer.go`

- [ ] `handleBackfillJob()`:
  1. Load integration → decrypt credentials
  2. Tạo ShopBase client
  3. Paginate `client.ListOrders()` theo 250/page, sort `created_at asc`
  4. Với mỗi order → `shopbase.MapOrderToInput()` → `orderSvc.UpsertOrderSnapshot()`
  5. Update `shopbase_sync_state.last_order_updated_at` sau mỗi batch
  6. Khi xong → `shopbase_sync_state.status = 'idle'`, `backfill_completed_at = NOW()`
  7. Nếu lỗi giữa chừng → lưu `last_error`, `last_error_at`, status = 'error'
- [ ] Re-run idempotent (upsert)

### 6.5 Dashboard — Orders Page

- [ ] Kiểm tra `ListOrders` query hoạt động đúng với `source_platform = 'shopbase'`
- [ ] Cột Delivery hiển thị `delivery_method` — đã có sẵn trong existing table/UI
- [ ] Badge payment/fulfillment render gracefully với raw ShopBase status strings (`paid`, `fulfilled`, `partial`, `pending`, v.v.)
- [ ] Order detail hiển thị line items, customer info, totals

---

## Phase 7: Backfill & Reconciliation

### 7.1 Reconciliation Job

**File:** `api/internal/worker/shopbase_consumer.go`

- [ ] Thêm reconciliation mode cho backfill: nhận `updated_at_min` param
  - Gọi `client.ListOrders(ListParams{ UpdatedAtMin: &lastSyncAt })`
  - Upsert orders có `updated_at` mới hơn stored
- [ ] Schedule hoặc trigger thủ công qua API
- [ ] Không chạy song song với backfill đang chạy (check status trước)

### 7.2 Sync Lock

**File:** `api/internal/worker/shopbase_consumer.go`

- [ ] Dùng Redis `SET NX EX` làm distributed lock cho backfill job theo `site_id`
- [ ] Lock TTL = 30 phút
- [ ] Nếu lock exists → return early (không enqueue duplicate)

---

## Phase 8: Health/Status UI

### 8.1 Health API

**File:** `api/internal/api/handlers/shopbase.go`

- [ ] `GET /api/v1/sites/:site_id/integration` — trả về:
  ```json
  {
    "platform": "shopbase",
    "status": "connected",
    "shop_domain": "example.onshopbase.com",
    "script_tag": { "installed": true },
    "webhooks": { "registered": 15, "missing": [] },
    "sync_state": {
      "status": "idle",
      "last_webhook_at": "...",
      "last_success_at": "...",
      "backfill_completed_at": "..."
    }
  }
  ```

### 8.2 Dashboard — Site Detail / Health Panel

- [ ] Panel hiển thị:
  - Platform: ShopBase
  - Connection: Connected / Error / Disconnected
  - Tracking script: Installed / Missing / Permission required
  - Webhooks: Active / Missing (N topics)
  - Last webhook: timestamp hoặc "Never"
  - Backfill: idle / running / completed / error + timestamp
- [ ] Button "Install Script" (chạy install-script endpoint)
- [ ] Button "Register Webhooks" (chạy register-webhooks endpoint)
- [ ] Button "Start Backfill" (chạy backfill endpoint)
- [ ] Polling trạng thái backfill khi status = 'running'

---

## Phase 9: Hardening

### 9.1 Rate Limiting

**File:** `api/internal/shopbase/client.go`

- [ ] Thêm rate limiter cho ShopBase API calls: max 2 req/s per client (ShopBase limit)
- [ ] Retry 3 lần với exponential backoff khi gặp 429 hoặc 5xx

### 9.2 Observability

- [ ] Log mọi ShopBase API call với `site_id`, `topic`, duration — không log credential
- [ ] Log webhook event nhận được với `site_id`, `topic`, `external_order_id`
- [ ] Log backfill progress: `site_id`, `batch_n`, `count`, `last_updated_at`

### 9.3 Tests

- [ ] `go test ./internal/shopbase/...` — client, mapper, HMAC
- [ ] Integration test: order mapper end-to-end với fixture JSON từ ShopBase
- [ ] Webhook HMAC test: valid + invalid
- [ ] Backfill idempotency test

### 9.4 Build check

- [ ] `go build ./...` không có lỗi
- [ ] `npm run build` trong `dashboard/` không có lỗi
- [ ] `go test ./...` pass

---

## Môi trường / Config

**File:** `.env` / `docker-compose.yml`

- [ ] Thêm env vars:
  ```
  INTEGRATION_ENCRYPTION_KEY=<32 bytes base64>
  TRACKER_BASE_URL=https://app.woosaas.com
  ```
- [ ] Thêm vào `docker-compose.yml` cho service `api` và `worker`
- [ ] Không commit key vào git

---

## Checklist cuối cùng trước khi merge

- [ ] Existing WooCommerce order sync không bị ảnh hưởng
- [ ] Backward-compat views `woo_orders` / `woo_order_items` hoạt động
- [ ] Credentials không bao giờ xuất hiện trong logs hoặc API response
- [ ] Webhook endpoint trả về 200 trong < 200ms (async processing)
- [ ] Webhook HMAC verify fail → 401 (không xử lý payload)
- [ ] Backfill re-run không tạo duplicate orders
- [ ] `go test ./...` pass
- [ ] `npm run build` pass
