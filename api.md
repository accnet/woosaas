**Tổng quan**

`site1.local` kết nối với `woosaas` theo 3 lớp:

1. **WordPress/plugin -> Woosaas API** bằng `X-Api-Key`
2. **Browser trên site1.local -> Woosaas API** cho tracking event
3. **Dashboard woosaas -> Woosaas API** bằng `Authorization: Bearer <JWT>`

Cấu hình local hiện tại:
- Plugin đang trỏ API về `http://localhost:8080`
- Đã verify được site ID `d3c0fc96-5cfd-4ce0-ac72-d77b86fd031f`
- Tracking đang bật
- Order/contact sync option chưa được lưu riêng, nhưng code plugin mặc định coi là bật

**1. Luồng cấu hình và verify từ wp-admin**

Trong màn admin plugin, người dùng nhập `API URL` và `API key`, rồi WordPress gọi:

```http
GET /api/v1/collect/verify
X-Api-Key: ...
```

Phía plugin:
- [class-admin.php](/var/www/site1.local/wp-content/plugins/plugin/includes/admin/class-admin.php:613)

Phía API:
- Route `/api/v1/collect/verify`
- Đi qua `APIKeyAuth`
- Nếu key hợp lệ thì trả `site_id`
- API cũng đánh dấu tracking đã được verify

Mã liên quan:
- [router.go](/home/accnet/woosaas/api/internal/api/router.go:97)
- [middleware.go](/home/accnet/woosaas/api/internal/api/middleware/middleware.go:113)
- [collect.go](/home/accnet/woosaas/api/internal/api/handlers/collect.go:160)

**2. Luồng tracking event từ site1.local**

Có 2 nguồn gửi event.

**2.1. Browser tracker**
JS tracker được inject vào frontend site:
- [class-tracker.php](/var/www/site1.local/wp-content/plugins/plugin/includes/class-tracker.php:12)
- [tracker.js](/var/www/site1.local/wp-content/plugins/plugin/assets/js/tracker.js:19)

Tracker tạo:
- `client_id`
- `session_id`
- `attribution`
- event `session_start`, `pageview`, `product_view`

Sau đó gửi:

```http
POST /api/v1/collect?api_key=...
Content-Type: application/json
```

Thông qua `navigator.sendBeacon()` hoặc `XMLHttpRequest`:
- [tracker.js](/var/www/site1.local/wp-content/plugins/plugin/assets/js/tracker.js:123)

**2.2. PHP plugin**
Một số event WooCommerce được PHP gửi server-to-server:
- `add_to_cart`
- `checkout_start`
- `purchase`

Nguồn:
- [class-woocommerce.php](/var/www/site1.local/wp-content/plugins/plugin/includes/class-woocommerce.php:15)
- [class-collector.php](/var/www/site1.local/wp-content/plugins/plugin/includes/class-collector.php:18)

Gửi:
```http
POST /api/v1/collect
X-Api-Key: ...
```

hoặc batch:
```http
POST /api/v1/collect/batch
X-Api-Key: ...
```

**3. API xử lý tracking event thế nào**

Request tracking vào API sẽ đi theo chuỗi:

```text
Collect route
-> APIKeyAuth
-> RateLimit
-> Validate payload
-> Deduplicate theo site_id + event_id
-> Push Redis stream events:stream
-> Cập nhật realtime online:<site_id>
-> Worker consume stream
-> Ghi analytics xuống ClickHouse
```

Các điểm chính:
- Route: [router.go](/home/accnet/woosaas/api/internal/api/router.go:97)
- Auth API key + cache Redis 5 phút: [middleware.go](/home/accnet/woosaas/api/internal/api/middleware/middleware.go:113)
- Rate limit 100 req/phút/site: [middleware.go](/home/accnet/woosaas/api/internal/api/middleware/middleware.go:155)
- Validate/dedupe/queue: [collect.go](/home/accnet/woosaas/api/internal/api/handlers/collect.go:23)
- Push `events:stream`: [collector.go](/home/accnet/woosaas/api/internal/ingest/collector.go:63)
- Worker đọc stream: [consumer.go](/home/accnet/woosaas/api/internal/worker/consumer.go:94)

**4. Luồng đồng bộ WooCommerce order**

Plugin nghe các hook:
- đổi trạng thái order
- refund
- trash order

Nguồn:
- [class-woocommerce.php](/var/www/site1.local/wp-content/plugins/plugin/includes/class-woocommerce.php:30)

Khi phát sinh, plugin build snapshot order đầy đủ:
- customer
- totals
- attribution
- client/session id
- items
- thời điểm order

Payload:
- [class-order-sync.php](/var/www/site1.local/wp-content/plugins/plugin/includes/class-order-sync.php:55)

Gửi sang API:

```http
POST /api/v1/woo/orders/sync
X-Api-Key: ...
X-Order-Sync-Enabled: true
X-Contact-Sync-Enabled: true|false
```

Nguồn:
- [class-order-sync.php](/var/www/site1.local/wp-content/plugins/plugin/includes/class-order-sync.php:113)

API xử lý:

```text
Woo sync route
-> APIKeyAuth
-> RateLimit
-> Validate batch <= 100 orders
-> Enqueue Redis stream orders:stream
-> Worker consume
-> Upsert woo_orders / woo_order_items
-> Có thể derive contact
-> Update sync state
```

Mã:
- Route: [router.go](/home/accnet/woosaas/api/internal/api/router.go:109)
- Handler: [orders.go](/home/accnet/woosaas/api/internal/api/handlers/orders.go:33)
- Queue `orders:stream`: [queue.go](/home/accnet/woosaas/api/internal/orders/queue.go:11)
- Worker consume order stream: [consumer.go](/home/accnet/woosaas/api/internal/worker/consumer.go:146)
- Upsert order vào Postgres: [repository.go](/home/accnet/woosaas/api/internal/orders/repository.go:43)

**5. Dashboard đọc dữ liệu ngược lại**

Dashboard không dùng API key. Nó dùng JWT:

```http
Authorization: Bearer <token>
```

Các nhóm route đọc dữ liệu:
- `/api/v1/stats/*`
- `/api/v1/orders`
- `/api/v1/orders/:woo_order_id`
- `/api/v1/contacts`
- `/api/v1/sites/:site_id/orders/sync-state`

Route và auth:
- [router.go](/home/accnet/woosaas/api/internal/api/router.go:127)
- [router.go](/home/accnet/woosaas/api/internal/api/router.go:154)
- [router.go](/home/accnet/woosaas/api/internal/api/router.go:181)
- [middleware.go](/home/accnet/woosaas/api/internal/api/middleware/middleware.go:76)

Frontend wrapper:
- [api.ts](/home/accnet/woosaas/dashboard/src/lib/api.ts:46)

**6. Sơ đồ ngắn**

```text
site1.local browser
  -> /api/v1/collect?api_key=...
  -> Redis events:stream
  -> Worker
  -> ClickHouse analytics

site1.local WordPress/PHP
  -> /api/v1/collect
  -> /api/v1/collect/batch
  -> Redis events:stream
  -> Worker
  -> ClickHouse

site1.local WooCommerce sync
  -> /api/v1/woo/orders/sync
  -> Redis orders:stream
  -> Worker
  -> Postgres woo_orders / contacts

site1.local WooCommerce backfill progress
  -> /api/v1/woo/orders/backfill-state
  -> Postgres woo_order_sync_state

woosaas dashboard
  -> JWT-protected stats/orders/sites APIs
  -> đọc Postgres + ClickHouse
```

**7. Điểm đáng chú ý trong setup local**

1. `.env` hiện chưa cấu hình `CORS_ALLOWED_ORIGINS`, trong khi default backend chỉ cho:
   - `http://localhost:3000`
   - `http://localhost:3001`

   Mã:
   - [config.go](/home/accnet/woosaas/api/internal/config/config.go:53)

   Vì vậy request browser từ `http://site1.local` có nguy cơ bị CORS chặn, nhất là các request XHR có custom header như batch collect.

2. Browser tracker đang đưa `api_key` lên query string cho `sendBeacon()`:
   - [tracker.js](/var/www/site1.local/wp-content/plugins/plugin/assets/js/tracker.js:125)

   Đây là chủ ý kỹ thuật vì beacon không set được custom header, nhưng làm key xuất hiện trong URL log/proxy/browser tooling.

3. `sendBatch()` trong `tracker.js` có khai báo nhưng tôi chưa thấy nơi nào gọi trực tiếp. Tracking browser hiện chủ yếu gửi từng event qua `send()`:
   - [tracker.js](/var/www/site1.local/wp-content/plugins/plugin/assets/js/tracker.js:139)

4. Order sync là **async hai pha**:
   - API trả `accepted` khi đã enqueue
   - Chưa có nghĩa order đã ghi DB xong
   - Trạng thái thực tế xem qua `/sites/:site_id/orders/sync-state`

5. Order mới phải được plugin gửi ngay khi checkout tạo đơn, không chờ backfill hoặc đợi order đổi trạng thái.

Nếu cần, tôi có thể làm tiếp một trong hai việc:
1. vẽ sequence diagram chuẩn cho toàn bộ luồng này, hoặc
2. kiểm tra trực tiếp hệ thống local đang chạy xem request từ `site1.local` có thật sự vào API và worker không.

**8. Contract API order sync**

### 8.1. `POST /api/v1/woo/orders/sync`

Auth:

```http
X-Api-Key: <site api key>
Content-Type: application/json
X-Order-Sync-Enabled: true
X-Contact-Sync-Enabled: true
```

Request body:

```json
{
  "orders": [
    {
      "woo_order_id": "1001",
      "woo_customer_id": "42",
      "status": "processing",
      "payment_status": "paid",
      "fulfillment_status": "unfulfilled",
      "currency": "USD",
      "total_amount": 49.95,
      "subtotal_amount": 45,
      "discount_amount": 0,
      "shipping_amount": 4.95,
      "tax_amount": 0,
      "refund_amount": 0,
      "items_count": 1,
      "customer_email": "buyer@example.com",
      "customer_first_name": "Buyer",
      "customer_last_name": "Example",
      "customer_phone": "+10000000000",
      "billing_company": "",
      "billing_address": {},
      "shipping_address": {},
      "client_id": "browser-client-id",
      "session_id": "browser-session-id",
      "attribution": {
        "source": "google",
        "medium": "cpc",
        "campaign": "spring"
      },
      "created_at_woo": "2026-05-12T10:00:00Z",
      "paid_at_woo": "2026-05-12T10:01:00Z",
      "completed_at_woo": null,
      "modified_at_woo": "2026-05-12T10:01:00Z",
      "deleted_at_woo": null,
      "items": [
        {
          "line_item_id": "1",
          "product_id": "sku-1",
          "variation_id": "",
          "sku": "SKU-1",
          "name": "Demo Product",
          "quantity": 1,
          "unit_price": 45,
          "line_subtotal": 45,
          "line_total": 45,
          "line_tax": 0
        }
      ],
      "raw_order": {}
    }
  ]
}
```

Required per order:

- `woo_order_id`
- `status`
- `currency`
- `modified_at_woo`
- `items`, minimum one item

Limits and behavior:

- Maximum `100` orders per request.
- API returns once messages are queued, not when PostgreSQL commit finishes.
- Worker treats `(site_id, woo_order_id)` as the canonical key.
- A snapshot with `modified_at_woo` older than or equal to the stored snapshot does not overwrite newer PostgreSQL data.
- If `X-Order-Sync-Enabled: false`, the API responds `200` with skipped orders.
- If `X-Contact-Sync-Enabled: false`, order rows are persisted but derived contact linking is skipped.

Success response:

```json
{
  "accepted": 1,
  "rejected": 0,
  "skipped": 0
}
```

Partial rejection response:

```json
{
  "accepted": 1,
  "rejected": 1,
  "skipped": 0,
  "errors": [
    {
      "woo_order_id": "",
      "error": "woo_order_id is required"
    }
  ]
}
```

### 8.2. `POST /api/v1/woo/orders/backfill-state`

Auth:

```http
X-Api-Key: <site api key>
Content-Type: application/json
```

Allowed statuses:

- `idle`
- `running`
- `done`
- `error`

Progress request:

```json
{
  "status": "running",
  "last_backfill_modified_at": "2026-05-12T10:00:00Z",
  "last_backfill_order_id": "1001"
}
```

Completion request:

```json
{
  "status": "done",
  "last_backfill_modified_at": "2026-05-12T10:00:00Z",
  "last_backfill_order_id": "1001",
  "backfill_completed_at": "2026-05-12T10:05:00Z"
}
```

Reset request:

```json
{
  "status": "idle"
}
```

Success response:

```json
{
  "status": "running"
}
```

Persistence behavior:

- Data is stored in `woo_order_sync_state`.
- `idle` clears stored backfill cursor/completion fields.
- `done` sets `backfill_completed_at`; if omitted, backend uses current server time.
- Invalid RFC3339 timestamps return `400`.
