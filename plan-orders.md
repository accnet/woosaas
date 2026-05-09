# Plan: Sync Day Du Don Hang WooCommerce

## Muc tieu

Xay dung luong sync day du thong tin don hang tu WooCommerce ve Woosaas de:

- co `order store` canonical cho nghiep vu commerce
- giu nguyen analytics event hien tai trong ClickHouse
- ho tro `realtime sync + backfill`
- co `orders list + order detail API`
- co `contact` lay truc tiep tu thong tin don hang
- tranh double-count doanh thu va order trong analytics hien tai

COT `Order` tren UI se hien thi truc tiep tu `woo_order_id`.

## Current State

### 1. WordPress plugin

Plugin dang dev tai `/var/www/site1.local/wp-content/plugins/plugin`.

Cau truc file:

```
woosaas.php                        # entry point, constants, load dependencies
includes/
  class-woosaas.php                # helpers (woosaas_get_api_url, woosaas_get_api_key)
  class-tracker.php                # enqueue tracker.js, inject product context
  class-attribution.php            # doc/luu attribution cookie, preserve vao order meta
  class-collector.php              # build event, queue, send /collect va /collect/batch
  class-woocommerce.php            # dang ky WooCommerce hooks, goi collector
  admin/class-admin.php            # settings page, AJAX verify + debug event
  utils/class-cookie.php
  utils/helpers.php
assets/
  js/tracker.js                    # client-side tracker
  js/admin.js
  css/admin.css
tests/unit/
  CollectorSchemaTest.php
  TrackerBootstrapTest.php
  AdminHelpersTest.php
```

Hooks hien tai da dang ky (class-woocommerce.php):

| Hook | Callback | Trang thai |
|---|---|---|
| `woocommerce_add_to_cart` | `track_add_to_cart` | Co san |
| `woocommerce_before_checkout_form` | `track_checkout_start` | Co san |
| `woocommerce_order_status_completed` | `track_order_complete` -> `track_purchase` | Co san |
| `woocommerce_checkout_order_processed` | `track_order_processed` — luu attribution meta | Co san |
| `woocommerce_remove_cart_item` | `track_remove_from_cart` | Co san (body trong) |

Payload `purchase` hien tai chi gom:

- `order_id`
- `revenue`
- `currency`
- `items_json` (product_id, product_name, quantity, price)
- `attribution`

Attribution da luu vao order meta:

- `_woosaas_attribution`
- `_woosaas_client_id`
- `_woosaas_session_id`

(Luu y: ca `class-attribution.php` lan `class-woocommerce.php` cung dang ky `woocommerce_checkout_order_processed` de luu meta — trung nhau, can don dep.)

Admin da co (class-admin.php):

- Settings page: API URL, API key, tracking enabled, track logged-in
- AJAX: `woosaas_verify_api`, `woosaas_send_debug_event`
- Status cards: connection, tracking, last verified, last debug event

Chua co:

- Hook `woocommerce_order_status_changed` -> gui order snapshot
- Hook `woocommerce_order_refunded` -> gui snapshot voi `refund_amount`
- Hook `woocommerce_trash_order` -> soft-delete signal
- Ham `build_order_payload()` full snapshot (billing, shipping, items day du, amounts, meta)
- Ham `sync_order()` gui len `POST /api/v1/woo/orders/sync`
- Backfill admin action + cursor WordPress option
- Sync status UI trong admin page

### 2. Backend API / worker

He thong backend hien tai dang optimized cho analytics event ingestion:

- plugin gui vao `POST /api/v1/collect` va `/api/v1/collect/batch`
- API validate event roi day vao Redis
- worker consume va ghi vao ClickHouse `analytics_events`

Validation `purchase` hien tai chi yeu cau:

- `order_id`
- `revenue`
- `currency`

Chua co:

- bang Postgres cho orders
- bang Postgres cho order items
- bang Postgres cho contacts suy ra tu order
- queue/job rieng cho order sync
- read APIs cho order list/detail

### 3. Dashboard / exports

Dashboard hien tai chua co order directory rieng.

`orders export` hien tai chi doc tu `purchase` events trong ClickHouse voi cac cot:

- `order_id`
- `event_time`
- `client_id`
- `revenue`
- `currency`
- `source`
- `medium`
- `campaign`

Toan bo revenue/orders overview hien tai dang dua tren event `purchase`.

## Product Decisions Da Chot

- Nguon du lieu orders: `Postgres canonical`
- Pham vi du lieu v1: `admin list core`
- Co `backfill theo batch`
- `refund/cancel` khong lam thay doi analytics revenue hien tai o v1
- Customer identity cho order: `email + client/session snapshot`
- Co `order list + order detail API`
- Them `contact` lay tu thong tin don hang
- Cot `Order` hien thi `woo_order_id`, khong dung `order_number` rieng
- Co toggle tat/bat `order sync` va `contact sync` doc lap nhau
- Toggle order sync tat thi backfill va realtime hook deu dung lai
- Toggle contact sync tat thi worker bo qua buoc derive/upsert contact (order van duoc luu)
- Ca hai toggle duoc luu o WordPress option, gui kem trong sync request header

## Architecture

### Nguyen tac tach he thong

Tach 2 he:

1. `Analytics event pipeline`
- van giu nhu hien tai
- ClickHouse tiep tuc la nguon cho overview, funnel, products, sources, customers event-based

2. `Commerce order pipeline`
- moi
- Postgres la canonical store cho orders, items, contacts, sync state
- dashboard orders se doc tu day

V1 khong dung order canonical de ghi de hoac tinh lai analytics.

### Tenant Isolation

He thong dung **shared database, shared schema** — khong co DB rieng hay schema rieng cho tung site. Isolation hoan toan dua vao cot `site_id` tren moi bang.

**Nguon goc `site_id` trong order pipeline:**

```
Plugin gui X-Api-Key
    │
    ▼
APIKeyAuth middleware
  SELECT site_id FROM api_keys WHERE key_hash = ?
  c.Set("site_id", site.ID)      ← UUID resolve tu API key
    │
    ▼
SyncOrders handler
  siteID := c.GetString("site_id")   ← lay tu context, KHONG tu body
  push vao orders:stream { "site_id": siteID, "order": ... }
    │
    ▼
Order Worker
  siteID = message.Values["site_id"]  ← lay tu stream message
  INSERT INTO woo_orders (site_id = siteID, ...)
```

**Quy tac bat buoc:**

- `site_id` KHONG BAO GIO lay tu payload JSON cua plugin
- Plugin khong the tu khai bao minh la site nao — chi API key quyet dinh
- Worker lay `site_id` tu Redis stream message (inject boi handler), khong tu truong nao trong order JSON

**Hau qua voi contact:**

- `woo_order_contacts` co unique constraint `(site_id, email)`
- Cung 1 email `buyer@x.com` mua o site A va site B tao 2 contact rieng biet
- Khong co global customer identity xuyen site — day la thiet ke dung (moi site la 1 merchant doc lap)

**Read API isolation:**

- Dashboard user: `TenantMiddleware.EnforceSiteAccess()` kiem tra `site_members` truoc khi cho truy cap
- Moi query luon co `WHERE site_id = $1` — khong co query nao tra du lieu khong loc theo site



### 1. `woo_orders`

Mot dong cho moi order cua mot site.

Field can co:

- `id`
- `site_id`
- `woo_order_id`
- `woo_customer_id`
- `status`
- `payment_status`
- `fulfillment_status`
- `currency`
- `total_amount`
- `subtotal_amount`
- `discount_amount`
- `shipping_amount`
- `tax_amount`
- `refund_amount`
- `items_count`
- `customer_email`
- `customer_first_name`
- `customer_last_name`
- `customer_phone`
- `billing_company`
- `billing_address_json`
- `shipping_address_json`
- `client_id`
- `session_id`
- `attribution_json`
- `contact_id`
- `created_at_woo`
- `paid_at_woo`
- `completed_at_woo`
- `modified_at_woo`
- `deleted_at_woo` neu co soft delete signal
- `raw_order_json`
- `synced_at`
- `created_at`
- `updated_at`

Constraints:

- unique `(site_id, woo_order_id)`
- index `(site_id, created_at_woo desc)`
- index `(site_id, modified_at_woo desc)`
- index `(site_id, contact_id)`
- index `(site_id, status)`

### 2. `woo_order_items`

Mot dong cho moi line item.

Field:

- `id`
- `site_id`
- `woo_order_id`
- `line_item_id`
- `product_id`
- `variation_id`
- `sku`
- `name`
- `quantity`
- `unit_price`
- `line_subtotal`
- `line_total`
- `line_tax`
- `raw_item_json`
- `created_at`
- `updated_at`

Constraints:

- unique `(site_id, woo_order_id, line_item_id)`
- index `(site_id, product_id)`

### 3. `woo_order_contacts`

Contact canonical duoc suy ra tu billing/shipping/order customer info.

Field:

- `id`
- `site_id`
- `woo_customer_id`
- `email`
- `phone`
- `first_name`
- `last_name`
- `full_name`
- `company`
- `billing_address_json`
- `shipping_address_json`
- `first_order_id`
- `last_order_id`
- `first_seen_at`
- `last_seen_at`
- `orders_count`
- `total_spent`
- `created_at`
- `updated_at`

Constraints:

- unique `(site_id, email)` khi `email` co gia tri
- index `(site_id, phone)`
- index `(site_id, woo_customer_id)`

### 4. `woo_order_sync_state`

Theo doi backfill va realtime sync theo site.

Field:

- `site_id`
- `order_sync_enabled` (BOOLEAN DEFAULT TRUE) — tat/bat toan bo order sync
- `contact_sync_enabled` (BOOLEAN DEFAULT TRUE) — tat/bat contact derivation
- `status`
- `last_backfill_modified_at`
- `last_backfill_order_id`
- `last_realtime_synced_at`
- `last_success_at`
- `last_error`
- `last_error_at`
- `backfill_completed_at`
- `created_at`
- `updated_at`

## Source Of Truth Va Mapping

### Order column mapping tren UI

Orders list v1 se hien thi:

- `Order` -> `woo_order_id`
- `Date created` -> `created_at_woo`
- `Customer` -> `customer_first_name + customer_last_name`, fallback `customer_email`
- `Payment` -> `payment_status`
- `Fulfillment` -> `fulfillment_status`
- `Total` -> `total_amount`
- `Items` -> `items_count`

### Contact mapping

Contact se lay tu thong tin don hang theo uu tien:

1. billing email / phone / name
2. shipping name / company neu billing thieu
3. `woo_customer_id` neu order gan voi Woo account
4. attribution + `client_id` + `session_id` snapshot da luu trong order meta

Rule merge contact v1:

- uu tien match theo normalized `email`
- neu khong co email thi fallback normalized `phone`
- neu ca hai deu thieu thi tao contact theo order-local data va khong merge bang name
- khong merge contact chi dua vao name
- payload moi chi duoc bo sung field thieu, khong xoa gia tri cu khi payload moi trong

## Plugin Changes

### Hien trang code can luu y truoc khi them

**Trung hook attribution** — don dep truoc:

- `class-attribution.php::preserve_attribution_on_checkout` va `class-woocommerce.php::track_order_processed` cung dang ky `woocommerce_checkout_order_processed` voi cung logic luu meta.
- Giu lai o `class-woocommerce.php`, xoa khoi `class-attribution.php` hoac doi `class-attribution.php` thanh pure utility (khong dang ky hook).

**Them class moi** `class-order-sync.php`:

- Tach biet khoi `class-collector.php` (analytics event)
- Chua toan bo logic build payload + gui `/api/v1/woo/orders/sync`
- Duoc khoi tao trong `woosaas.php::load_dependencies()` va `init_components()`

### Hooks can them (class-woocommerce.php)

Giu 5 hook cu nguyen ven, them 3 hook moi:

```php
// Trong __construct():
add_action('woocommerce_order_status_changed',
    array($this, 'sync_order_on_status_change'), 10, 4);

add_action('woocommerce_order_refunded',
    array($this, 'sync_order_on_refund'), 10, 2);

add_action('wp_trash_post',
    array($this, 'sync_order_on_trash'), 10, 1);
```

Callback:

- `sync_order_on_status_change($order_id, $old_status, $new_status, $order)` — gui snapshot day du
- `sync_order_on_refund($order_id, $refund_id)` — gui snapshot voi `refund_amount` moi
- `sync_order_on_trash($post_id)` — kiem tra `get_post_type($post_id) === 'shop_order'` truoc khi gui signal

### Ham build_order_payload() (class-order-sync.php)

Build full snapshot tu `WC_Order`:

```php
private function build_order_payload(WC_Order $order): array {
    // Lay meta attribution da luu tu hook checkout_order_processed
    $attribution = json_decode($order->get_meta('_woosaas_attribution'), true);
    $client_id   = $order->get_meta('_woosaas_client_id');
    $session_id  = $order->get_meta('_woosaas_session_id');

    // Build items
    $items = [];
    foreach ($order->get_items() as $item_id => $item) {
        $product = $item->get_product();
        $items[] = [
            'line_item_id'  => (string) $item_id,
            'product_id'    => (string) $item->get_product_id(),
            'variation_id'  => (string) $item->get_variation_id(),
            'sku'           => $product ? $product->get_sku() : '',
            'name'          => $item->get_name(),
            'quantity'      => $item->get_quantity(),
            'unit_price'    => (float) ($item->get_total() / max(1, $item->get_quantity())),
            'line_subtotal' => (float) $item->get_subtotal(),
            'line_total'    => (float) $item->get_total(),
            'line_tax'      => (float) $item->get_total_tax(),
        ];
    }

    return [
        'woo_order_id'          => (string) $order->get_id(),
        'woo_customer_id'       => (string) $order->get_customer_id(),
        'status'                => $order->get_status(),
        'payment_status'        => $this->map_payment_status($order),
        'fulfillment_status'    => $this->map_fulfillment_status($order),
        'currency'              => $order->get_currency(),
        'total_amount'          => (float) $order->get_total(),
        'subtotal_amount'       => (float) $order->get_subtotal(),
        'discount_amount'       => (float) $order->get_discount_total(),
        'shipping_amount'       => (float) $order->get_shipping_total(),
        'tax_amount'            => (float) $order->get_total_tax(),
        'refund_amount'         => (float) $order->get_total_refunded(),
        'items_count'           => count($items),
        'customer_email'        => $order->get_billing_email(),
        'customer_first_name'   => $order->get_billing_first_name(),
        'customer_last_name'    => $order->get_billing_last_name(),
        'customer_phone'        => $order->get_billing_phone(),
        'billing_company'       => $order->get_billing_company(),
        'billing_address'       => $this->extract_billing_address($order),
        'shipping_address'      => $this->extract_shipping_address($order),
        'client_id'             => $client_id ?: '',
        'session_id'            => $session_id ?: '',
        'attribution'           => $attribution ?: (object)[],
        'created_at_woo'        => $order->get_date_created()
                                       ? $order->get_date_created()->format('c') : null,
        'paid_at_woo'           => $order->get_date_paid()
                                       ? $order->get_date_paid()->format('c') : null,
        'completed_at_woo'      => $order->get_date_completed()
                                       ? $order->get_date_completed()->format('c') : null,
        'modified_at_woo'       => $order->get_date_modified()
                                       ? $order->get_date_modified()->format('c') : null,
        'items'                 => $items,
        'raw_order'             => [],   // v1: gui trong, tranh payload qua lon
    ];
}
```

Helper mapping:

```php
private function map_payment_status(WC_Order $order): string {
    $map = [
        'pending'    => 'unpaid',
        'processing' => 'paid',
        'on-hold'    => 'pending',
        'completed'  => 'paid',
        'cancelled'  => 'cancelled',
        'refunded'   => 'refunded',
        'failed'     => 'failed',
    ];
    return $map[$order->get_status()] ?? 'unknown';
}

private function map_fulfillment_status(WC_Order $order): string {
    $status = $order->get_status();
    if ($status === 'completed') return 'fulfilled';
    if ($status === 'cancelled' || $status === 'refunded') return 'cancelled';
    return 'unfulfilled';
}
```

### Ham sync_order() (class-order-sync.php)

```php
public function sync_order(WC_Order $order): void {
    if (empty($this->api_key)) return;

    $payload = wp_json_encode(['orders' => [$this->build_order_payload($order)]]);

    wp_remote_post($this->api_url . '/api/v1/woo/orders/sync', [
        'method'   => 'POST',
        'body'     => $payload,
        'headers'  => [
            'Content-Type' => 'application/json',
            'X-Api-Key'    => $this->api_key,
        ],
        'timeout'  => 10,
        'blocking' => false,
    ]);
}
```

### Payload order sync

Endpoint moi:

- `POST /api/v1/woo/orders/sync`

Request:

```json
{
  "orders": [
    {
      "woo_order_id": "10001",
      "woo_customer_id": "123",
      "status": "pending",
      "payment_status": "unpaid",
      "fulfillment_status": "unfulfilled",
      "currency": "THB",
      "total_amount": 134.0,
      "subtotal_amount": 120.0,
      "discount_amount": 0.0,
      "shipping_amount": 10.0,
      "tax_amount": 4.0,
      "refund_amount": 0.0,
      "items_count": 1,
      "customer_email": "buyer@example.com",
      "customer_first_name": "Tu",
      "customer_last_name": "Chiu",
      "customer_phone": "0800000000",
      "billing_company": "",
      "billing_address": {},
      "shipping_address": {},
      "client_id": "cid_123",
      "session_id": "sid_123",
      "attribution": {},
      "created_at_woo": "2026-05-10T01:42:00Z",
      "paid_at_woo": null,
      "completed_at_woo": null,
      "modified_at_woo": "2026-05-10T01:42:00Z",
      "items": [
        {
          "line_item_id": "1",
          "product_id": "10",
          "variation_id": "0",
          "sku": "SKU-1",
          "name": "Product A",
          "quantity": 1,
          "unit_price": 120.0,
          "line_subtotal": 120.0,
          "line_total": 120.0,
          "line_tax": 4.0
        }
      ],
      "raw_order": {}
    }
  ]
}
```

Bat buoc:

- `woo_order_id`
- `modified_at_woo`
- `currency`
- `status`
- `items`

Batching:

- default 50 orders / request
- hard limit 100 orders / request

Auth:

- dung `X-Api-Key` hien tai cua site

Headers dieu khien sync:

```
X-Order-Sync-Enabled: true   # neu false, server tra 200 accepted=0 va khong xu ly
X-Contact-Sync-Enabled: true # neu false, worker bo qua contact derivation
```

- Neu `X-Order-Sync-Enabled: false`, handler tra ve `{accepted: 0, skipped: n, reason: "order_sync_disabled"}` ngay, khong push vao queue
- Neu `X-Contact-Sync-Enabled: false`, order van duoc luu nhung `contact_id` se la NULL tren row do

### Backfill trong plugin (class-admin.php)

Them submenu moi `woosaas-sync`:

```php
add_submenu_page('woosaas', 'Order Sync', 'Order Sync',
    'manage_options', 'woosaas-sync', [$this, 'render_sync_page']);
```

Them AJAX action `woosaas_backfill_orders`:

```php
add_action('wp_ajax_woosaas_backfill_orders', [$this, 'handle_backfill_ajax']);
```

Flow backfill:

- query `wc_get_orders(['limit' => 50, 'orderby' => 'date_modified', 'order' => 'ASC', 'date_modified' => '>' . cursor])`
- build payload batch
- gui len `/api/v1/woo/orders/sync`
- luu cursor vao WordPress option

WordPress options cursor:

- `woosaas_last_backfill_modified_at` — ISO8601 string
- `woosaas_last_backfill_order_id` — integer
- `woosaas_last_backfill_status` — `idle` / `running` / `done` / `error`
- `woosaas_last_backfill_at` — timestamp hoan thanh batch cuoi

Neu backfill bi dung giua chung:

- plugin resume tu `woosaas_last_backfill_modified_at`
- order da sync roi se duoc worker bo qua neu `modified_at_woo` khong moi hon

### WordPress options cho toggle sync

| Option | Type | Default | Y nghia |
|---|---|---|---|
| `woosaas_order_sync_enabled` | string `yes`/`no` | `yes` | Bat/tat toan bo order sync (realtime + backfill) |
| `woosaas_contact_sync_enabled` | string `yes`/`no` | `yes` | Bat/tat contact derivation trong worker |

Logic kiem tra trong `class-order-sync.php`:

```php
public function sync_order(WC_Order $order): void {
    if (get_option('woosaas_order_sync_enabled', 'yes') !== 'yes') {
        return; // order sync bi tat, bo qua
    }
    // ... build payload va gui
}

public function get_contact_sync_header(): string {
    return get_option('woosaas_contact_sync_enabled', 'yes') === 'yes' ? 'true' : 'false';
}

private function send_batch(array $orders): void {
    wp_remote_post($this->api_url . '/api/v1/woo/orders/sync', [
        'headers' => [
            'Content-Type'              => 'application/json',
            'X-Api-Key'                 => $this->api_key,
            'X-Order-Sync-Enabled'      => 'true',
            'X-Contact-Sync-Enabled'    => $this->get_contact_sync_header(),
        ],
        ...
    ]);
}
```

Backfill cung kiem tra option truoc khi chay:

```php
public function handle_backfill_ajax(): void {
    if (get_option('woosaas_order_sync_enabled', 'yes') !== 'yes') {
        wp_send_json_error(['message' => 'Order sync is disabled']);
        return;
    }
    // ...
}
```

Sync status panel trong admin hien thi:

- toggle `Order Sync` (on/off)
- toggle `Contact Sync` (on/off, chi hien thi khi order sync dang on)
- trang thai backfill
- so order da sync (neu co the tra ve tu API)
- nut `Start Sync` / `Resume Sync` / `Reset`
- canh bao ro khi ca hai toggle deu tat

## Backend Changes

### 1. API server

Them handler moi cho `POST /api/v1/woo/orders/sync`.

Trach nhiem:

- validate API key
- resolve `site_id`
- parse batch payload
- validate field bat buoc
- khong ghi truc tiep DB
- push vao queue/job rieng cho order sync
- tra response accepted/rejected count

Validation v1:

- reject order thieu `woo_order_id`
- reject order thieu `modified_at_woo`
- reject order thieu `status`
- reject batch vuot hard limit
- cho phep field optional trong

### 2. Queue / worker

Them queue/job rieng cho order sync, khong tron voi analytics event queue hien tai.

**Luu y isolation:** worker lay `site_id` tu Redis stream message, khong tu truong nao trong order JSON payload. Tuong tu pattern hien tai cua analytics consumer:

```go
// Dung — lay tu stream message
siteID := message.Values["site_id"].(string)

// SAI — khong duoc lay tu payload body
// siteID := orderPayload.SiteID
```

Worker flow cho moi order:

1. normalize payload
2. doc `contact_sync_enabled` tu message metadata (inject boi handler tu header)
3. check order hien tai theo `(site_id, woo_order_id)`
4. neu khong ton tai -> insert
5. neu ton tai va `modified_at_woo` moi hon -> update
6. neu cung `modified_at_woo` -> bo qua
7. upsert line items
8. neu `contact_sync_enabled = true` -> derive/upsert contact, gan `contact_id`
9. neu `contact_sync_enabled = false` -> bo qua contact, de `contact_id = NULL`
10. cap nhat `woo_order_sync_state`

Idempotency key:

- `(site_id, woo_order_id, modified_at_woo)`

Line item strategy:

- v1 dung `replace set`
- moi lan order snapshot moi duoc chap nhan, xoa logical tap cu cua items theo order roi insert/upsert lai theo payload

### 3. Contact derivation

Worker derive contact ngay trong luong sync order, khong tach job rieng o v1.

Business rules:

- normalize email lower-case va trim
- normalize phone ve mot format on dinh
- tim contact theo email truoc
- neu khong thay va co phone -> tim theo phone
- neu tim thay -> merge thong tin moi vao contact cu
- neu khong thay -> tao contact moi
- gan `contact_id` nguoc lai cho `woo_orders`

Cap nhat aggregate:

- `last_order_id`
- `last_seen_at`
- `orders_count`
- `total_spent`

Luu y:

- `orders_count` va `total_spent` chi duoc tang/chinh lai khi order snapshot moi duoc accept
- implementer nen recompute aggregate tu `woo_orders` cua contact sau moi lan sync de tranh sai so khi refund/status update

### 4. Analytics compatibility

V1 GIU NGUYEN analytics hien tai:

- khong phat sinh them `purchase` tu order sync
- khong phat sinh `refund` analytics event tu order sync
- overview revenue/orders van doc tu ClickHouse `purchase`
- order canonical chi phuc vu orders UI va data operations

Ly do:

- tranh double-count
- tranh thay doi toan bo query hien tai
- tach implementation risk cho dot dau

## Read APIs

### 1. Orders list

`GET /api/v1/orders`

Params:

- `site_id` bat buoc
- `page`
- `page_size`
- `q`
- `payment_status`
- `fulfillment_status`
- `status`
- `date_from`
- `date_to`

Response item:

- `woo_order_id`
- `created_at_woo`
- `customer_name`
- `customer_email`
- `payment_status`
- `fulfillment_status`
- `total_amount`
- `currency`
- `items_count`
- `status`
- `contact_id`

Sort mac dinh:

- `created_at_woo desc`

### 2. Order detail

`GET /api/v1/orders/:woo_order_id`

Response:

- toan bo fields cua `woo_orders`
- `contact`
- `items`
- `billing_address`
- `shipping_address`
- `attribution`
- `client_id`
- `session_id`

### 3. Contacts

V1 co the them contract doc du lieu du chua can UI ngay:

`GET /api/v1/contacts`

Response item:

- `id`
- `email`
- `phone`
- `full_name`
- `company`
- `orders_count`
- `total_spent`
- `first_seen_at`
- `last_seen_at`

## UI Scope

### Orders list v1

Can co table voi cac cot:

- `Order`
- `Date created`
- `Customer`
- `Payment`
- `Fulfillment`
- `Total`
- `Items`

Display note:

- `Order` render tu `woo_order_id`
- co the prefix `#` o UI, nhung value canonical van la `woo_order_id`
- `Customer` fallback ve email neu khong co full name
- `Items` la tong line items count, khong phai tong distinct product categories

### Order detail v1

Can co:

- thong tin header cua order
- payment / fulfillment state
- contact block
- billing / shipping address
- danh sach items
- attribution snapshot
- client/session snapshot

## Implementation Order

### Phase 1

- them migrations Postgres cho `woo_orders`, `woo_order_items`, `woo_order_contacts`, `woo_order_sync_state`
- them models / repository layer
- them API `POST /api/v1/woo/orders/sync`
- them worker order sync va idempotent upsert

### Phase 2

- cap nhat plugin de gui full order snapshot realtime
- luu them contact fields va order fields day du
- them backfill batch trong plugin admin

### Phase 3

- them read APIs `orders list`, `order detail`, `contacts`
- them UI Orders list
- them UI Order detail
- them sync state readout neu can

## Testing

### Backend tests

- validate payload order sync: thieu `woo_order_id` -> fail
- validate payload order sync: thieu `modified_at_woo` -> fail
- duplicate sync cung `modified_at_woo` -> khong tao duplicate
- sync moi hon theo `modified_at_woo` -> cap nhat order
- item list thay doi -> items duoc replace dung
- merge contact theo email dung
- fallback merge contact theo phone dung
- khong merge contact chi trung name
- order detail tra dung `contact_id`, `items`, `addresses`
- analytics queries hien tai khong doi ket qua sau khi bat order sync
- `X-Order-Sync-Enabled: false` -> handler tra `accepted=0`, khong push queue
- `X-Contact-Sync-Enabled: false` -> order duoc luu, `contact_id = NULL`, khong tao contact
- `X-Contact-Sync-Enabled: true` -> order duoc luu va contact duoc derive dung

### Plugin tests

Tests dang co (can giu va mo rong):

- `CollectorSchemaTest.php` — validate schema event hien tai
- `TrackerBootstrapTest.php` — bootstrap JS
- `AdminHelpersTest.php` — admin helper functions

Tests can them:

- `build_order_payload()` tu `WC_Order` mock tra dung 20+ fields
- payload co du `billing_address`, `shipping_address`, `items` voi `line_item_id`
- payload lay dung `_woosaas_attribution`, `_woosaas_client_id`, `_woosaas_session_id` tu order meta
- `map_payment_status()` mapping dung cho tung WooCommerce status
- `map_fulfillment_status()` mapping dung
- backfill gui dung batch size (50 max)
- backfill resume dung theo cursor `woosaas_last_backfill_modified_at`
- hook `woocommerce_order_status_changed` goi `sync_order()`
- hook `woocommerce_order_refunded` goi `sync_order()` voi `refund_amount` > 0
- hook `wp_trash_post` chi goi sync khi post_type la `shop_order`
- khong dang ky hook attribution trung nhau (chi 1 callback cho `woocommerce_checkout_order_processed`)
- khi `woosaas_order_sync_enabled = no`, `sync_order()` return som, khong gui request
- khi `woosaas_order_sync_enabled = no`, backfill AJAX tra loi `order_sync_disabled`
- khi `woosaas_contact_sync_enabled = no`, header `X-Contact-Sync-Enabled: false` duoc gui
- khi `woosaas_contact_sync_enabled = yes`, header `X-Contact-Sync-Enabled: true` duoc gui

### Acceptance tests

- order moi trong Woo xuat hien tren Orders list voi 7 cot v1
- cot `Order` hien thi `woo_order_id`
- order detail hien thi contact lay tu thong tin don hang
- nhieu orders cung email gom ve 1 contact canonical
- backfill dua du lich su order cu len
- overview analytics revenue/orders khong thay doi sau khi bat order sync
- tat order sync -> order moi khong xuat hien trong list, analytics khong bi anh huong
- bat lai order sync -> order moi lai duoc sync binh thuong
- tat contact sync -> order duoc luu nhung khong xuat hien trong contacts list, `contact_id = NULL`
- bat lai contact sync -> order moi co contact, order cu giu nguyen `contact_id = NULL` cho den khi re-derive

## Risks Va Guardrails

### 1. Double-count analytics

Rui ro:

- neu order sync tu dong emit purchase event thi overview se bi doi

Guardrail:

- v1 khong emit analytics events tu order sync

### 2. Contact merge nham

Rui ro:

- merge theo name co the sai

Guardrail:

- chi merge theo email, fallback phone
- khong merge theo name-only

### 3. Stale overwrite

Rui ro:

- payload cu ghi de payload moi

Guardrail:

- chi update neu `modified_at_woo` moi hon

### 4. Backfill va realtime chay song song

Rui ro:

- order bi sync lap

Guardrail:

- worker idempotent theo `(site_id, woo_order_id, modified_at_woo)`

### 5. Tat order sync nhung con contact NULL trong DB

Rui ro:

- user bat order sync, dat mot so order, tat di. Cac order trong thoi gian sync se co `contact_id = NULL`. Khi bat lai, cac order cu khong duoc retrigger nen contact van NULL.

Guardrail:

- Khi bat lai contact sync, nut `Re-derive contacts` chay retroactive: worker quet cac row `woo_orders WHERE contact_id IS NULL` va derive lai
- V1 co the de manual: user chay lai backfill toan phan se upsert lai cac order voi `modified_at_woo` cu hon nen bi bo qua boi idempotency guard
- Giai phap v1: them endpoint `POST /api/v1/woo/contacts/rederive` chay background job quet `contact_id IS NULL` theo `site_id` (neu can, de v2)

### 6. Tat order sync o plugin nhung backend van nhan request

Rui ro:

- Admin tat toggle trong plugin nhung co plugin/script khac gui truc tiep vao endpoint

Guardrail:

- Backend khong co server-side toggle o v1 (toggle chi o plugin)
- Neu can enforce o backend: them field `order_sync_enabled` vao `woo_order_sync_state` va check trong handler truoc khi push queue (de v2)

## Explicit Assumptions

- V1 chi sync order qua plugin push, chua lam backend pull bang Woo REST credentials.
- Analytics event pipeline hien tai se duoc giu nguyen.
- Refund/cancel chi phan anh trong canonical order store, chua doi overview revenue.
- Contact v1 chi lay tu thong tin don hang, chua dong bo Woo users/customer directory day du.
- `woo_order_id` la gia tri canonical cho cot `Order`.
- UI chi can `admin list core` trong dot dau, khong can accounting-grade breakdown day du hon nua.

## Ket Qua Kiem Tra Codebase Hien Tai

### Co the tai su dung

| Thanh phan | Hien trang | Tai su dung cho order plan |
|---|---|---|
| `APIKeyAuth` middleware | Hoan chinh — hash + Redis cache, resolve `site_id` | Dung truc tiep cho `POST /api/v1/woo/orders/sync` |
| Rate limiting | Hoan chinh — 100 req/min per site | Ap dung duoc cho sync endpoint |
| Redis Streams + Consumer group | Hoan chinh — `events:stream`, group `woosaas-workers` | Order queue can stream **rieng** (`orders:stream`) |
| Postgres pool (pgxpool) | Hoan chinh | Dung cho 4 bang order moi |
| Migration runner (`cmd/migrate`) | Co san | Them migration file tiep theo `002_woo_orders.sql` |
| CORS, JWT auth | Hoan chinh | Read APIs dung JWT, sync dung API key |

### Chua co — can build tu dau

**DB Migrations** — `migrations_postgres/` hien chi co `001_init.sql`:
- `woo_orders`
- `woo_order_items`
- `woo_order_contacts`
- `woo_order_sync_state`

**Models** — `pkg/models/models.go` chua co:
- `WooOrder`, `WooOrderItem`, `WooOrderContact`, `WooOrderSyncState`
- `OrderSyncRequest`, `OrderSyncItemPayload` (request body)

**API Handler + Route group** — `router.go` chua co group `/woo`:
- `POST /api/v1/woo/orders/sync`
- Validation bat buoc + hard limit 100 orders/batch
- Push vao `orders:stream`, khong ghi DB truc tiep

**Order Queue** — can tach khoi `events:stream`:
- Stream key moi: `orders:stream`
- Consumer group moi: `woosaas-order-workers`
- Khong tai su dung `eventBatchWriter` (no ghi ClickHouse)

**Order Worker** — logic hoan toan moi:
- Idempotent upsert theo `(site_id, woo_order_id, modified_at_woo)`
- `modified_at_woo` guard — bo qua neu khong moi hon
- Replace-set line items moi lan snapshot duoc chap nhan
- Contact derivation (normalize → match → merge → tao moi)
- Recompute aggregate `orders_count`, `total_spent` tu DB

**Order Repository** — package moi `internal/orders/`:
- `UpsertOrder`, `UpsertOrderItems`, `UpsertContact`, `UpdateSyncState`

**Read APIs** — chua co:
- `GET /api/v1/orders`
- `GET /api/v1/orders/:woo_order_id`
- `GET /api/v1/contacts`

**UI** — chua co `dashboard/src/app/dashboard/[siteId]/orders/`

**Plugin** — chua co:
- Hook `woocommerce_order_status_changed`, `order_refunded`, `trash_order`
- Build full order payload (billing, shipping, items, attribution)
- Backfill admin action + cursor WordPress option

## Quyet Dinh Thiet Ke Bo Sung

### 1. Order worker chay o dau

Lua chon: goroutine rieng trong cung process `cmd/worker`, khong tach `cmd/order-worker`.

Ly do:
- Don gian hoa deploy (1 container worker duy nhat)
- De dung chung Redis client da khoi tao
- Co the tach sau neu can scale doc lap

Thuc hien: them `StartOrderWorker(ctx)` chay song song voi analytics worker hien tai trong `cmd/worker/main.go`.

### 2. Order repository thuoc package nao

Lua chon: package rieng `internal/orders/` — khong tron vao `sites.Repository`.

Ly do:
- `sites.Repository` hien tai da xu ly user, site, api_key, tracking — them order se qua lon
- Tach concern ro rang giua site management va commerce data
- De test doc lap

### 3. Contact recompute aggregate

Sau moi lan order snapshot duoc chap nhan, recompute tu DB:

```sql
SELECT COUNT(*), COALESCE(SUM(total_amount), 0)
FROM woo_orders
WHERE contact_id = $1
  AND site_id = $2
  AND status NOT IN ('cancelled', 'failed', 'trash')
  AND deleted_at_woo IS NULL
```

Khong dung increment/decrement vi de gay sai so khi refund/cancel/replay.

### 4. Kieu du lieu woo_order_id

Lua chon: `VARCHAR(64)` — khong dung `BIGINT`.

Ly do:
- WooCommerce tra ve string trong REST API
- Tranh type mismatch khi parse payload JSON
- Cho phep custom order ID prefix neu WooCommerce co plugin custom order number

Unique constraint: `(site_id, woo_order_id)` voi unique index.

### 5. raw_order_json va raw_item_json

Lua chon: `JSONB` tren Postgres.

Gioi han:
- Khong validate size o v1 (WooCommerce order thuong < 32KB)
- Neu can, them CHECK constraint hoac truncate o worker sau

Luu y: `raw_order_json` la debug/audit field, khong dung cho business logic.

## Thu Tu Implement Chi Tiet

Trien khai theo thu tu dependency, khong nhat thiet theo phase:

```
001_init.sql (da co)
    |
    v
002_woo_orders.sql
(woo_orders, woo_order_items, woo_order_contacts, woo_order_sync_state)
    |
    v
pkg/models/models.go
(WooOrder, WooOrderItem, WooOrderContact, WooOrderSyncState, OrderSyncRequest)
    |
    v
internal/orders/repository.go
(UpsertOrder, UpsertOrderItems, UpsertContact, UpdateSyncState, GetOrder, ListOrders)
    |
    v
internal/orders/contact_deriver.go
(normalize email/phone, match, merge, recompute aggregate)
    |
    v
internal/api/handlers/orders.go
(SyncOrders handler: validate -> push orders:stream)
    |
    v
router.go — them route group /woo va /orders
    |
    v
internal/worker/order_consumer.go
(consume orders:stream, idempotent upsert, call deriver)
    |
    v
cmd/worker/main.go — them StartOrderWorker goroutine
    |
    v
[Phase 2 - Plugin]
  1. Don dep hook trung: xoa preserve_attribution_on_checkout khoi class-attribution.php
  2. Them class-order-sync.php (build_order_payload, sync_order, helpers mapping)
  3. Them hooks vao class-woocommerce.php:
     - woocommerce_order_status_changed -> sync_order_on_status_change
     - woocommerce_order_refunded -> sync_order_on_refund
     - wp_trash_post -> sync_order_on_trash
  4. Them backfill page + AJAX vao class-admin.php (submenu woosaas-sync)
  5. Load class-order-sync.php trong woosaas.php::load_dependencies()
    |
    v
[Phase 3] Read APIs: GET /orders, GET /orders/:id, GET /contacts
    |
    v
[Phase 3] UI: dashboard/[siteId]/orders/ — list + detail
```

## Task List

### PHASE 1 — Backend Core (khong can plugin)

#### T1.1 — DB Migration
File: `api/migrations_postgres/002_woo_orders.sql`

- Tao bang `woo_orders` voi day du fields va constraints theo plan
- Tao bang `woo_order_items` voi unique `(site_id, woo_order_id, line_item_id)`
- Tao bang `woo_order_contacts` voi unique `(site_id, email)`, index phone, woo_customer_id
- Tao bang `woo_order_sync_state` voi `order_sync_enabled`, `contact_sync_enabled`, cursor fields
- Chay `cmd/migrate` va verify schema

Dep: khong co

---

#### T1.2 — Models
File: `api/pkg/models/models.go`

- Them struct `WooOrder` (map day du 30+ fields, json + db tags)
- Them struct `WooOrderItem`
- Them struct `WooOrderContact`
- Them struct `WooOrderSyncState`
- Them struct `OrderSyncItemPayload` (item trong request tu plugin)
- Them struct `OrderSyncOrderPayload` (order trong request tu plugin)
- Them struct `OrderSyncRequest` (`{ orders: [] }`)
- Them struct `OrderSyncResponse` (`{ accepted, rejected, errors[] }`)

Dep: T1.1

---

#### T1.3 — Order Repository
File: `api/internal/orders/repository.go` (package moi)

- `NewRepository(db *pgxpool.Pool) *Repository`
- `UpsertOrder(ctx, siteID, payload) (*WooOrder, bool, error)` — tra ve (order, isNew, err), chi update neu `modified_at_woo` moi hon
- `UpsertOrderItems(ctx, siteID, wooOrderID, items [])` — replace-set: xoa items cu, insert lai
- `GetOrder(ctx, siteID, wooOrderID) (*WooOrder, error)`
- `ListOrders(ctx, siteID, filter ListOrdersFilter) ([]WooOrder, int, error)` — tra ve items + total count
- `UpdateSyncState(ctx, siteID, update SyncStateUpdate) error`
- `GetSyncState(ctx, siteID) (*WooOrderSyncState, error)`

Dep: T1.2

---

#### T1.4 — Contact Deriver
File: `api/internal/orders/contact_deriver.go`

- `DeriveContact(ctx, db, siteID, order *WooOrder) (*WooOrderContact, error)`
- Normalize email (lowercase, trim)
- Normalize phone (strip spaces/dashes, E.164-style neu co the)
- `findContactByEmail(ctx, siteID, email) (*WooOrderContact, error)`
- `findContactByPhone(ctx, siteID, phone) (*WooOrderContact, error)`
- Merge logic: bo sung field thieu, khong xoa gia tri cu
- Recompute `orders_count` va `total_spent` tu `woo_orders WHERE contact_id = ? AND status NOT IN ('cancelled','failed','trash')`
- Cap nhat `contact_id` nguoc lai vao `woo_orders`

Dep: T1.3

---

#### T1.5 — Sync Handler
File: `api/internal/api/handlers/orders.go`

- `NewOrdersHandler(repo *orders.Repository) *OrdersHandler`
- `SyncOrders(c *gin.Context)`
  - doc `site_id` tu context (da resolve boi APIKeyAuth)
  - doc header `X-Order-Sync-Enabled` (default true)
  - neu false: tra `{accepted:0, skipped:n, reason:"order_sync_disabled"}` ngay
  - parse `OrderSyncRequest`, validate hard limit 100
  - validate tung order: bat buoc `woo_order_id`, `modified_at_woo`, `status`, `currency`, `items`
  - push vao `orders:stream` voi `{site_id, contact_sync_enabled, order: jsonString}`
  - tra `OrderSyncResponse`

Dep: T1.2, T1.3

---

#### T1.6 — Router update
File: `api/internal/api/router.go`

- Them field `orderRepo *orders.Repository` vao `Router` struct
- Them khoi tao trong `NewRouter()`
- Them route group:
  ```
  woo := v1.Group("/woo")
  woo.Use(mw.APIKeyAuth(repo))
  woo.Use(mw.RateLimit())
  woo.POST("/orders/sync", ordersHandler.SyncOrders)
  ```

Dep: T1.5

---

#### T1.7 — Order Consumer
File: `api/internal/worker/order_consumer.go`

- `NewOrderConsumer(redis, pg, config) *OrderConsumer`
- Consume stream `orders:stream`, group `woosaas-order-workers`
- Parse message: lay `site_id`, `contact_sync_enabled`, `order` JSON
- Goi `repo.UpsertOrder()` -> neu skip (same modified_at) thi ACK va tiep tuc
- Goi `repo.UpsertOrderItems()`
- Neu `contact_sync_enabled = true`: goi `deriver.DeriveContact()`
- Goi `repo.UpdateSyncState()`
- Dead letter queue khi qua max retry
- `Start(ctx)`, `Stop()`

Dep: T1.3, T1.4

---

#### T1.8 — Worker main update
File: `api/cmd/worker/main.go`

- Them khoi tao `orders.NewRepository(pg)`
- Them khoi tao `worker.NewOrderConsumer(redis, orderRepo, config)`
- Start goroutine `orderConsumer.Start(ctx)` song song voi analytics consumer
- Defer `orderConsumer.Stop()`

Dep: T1.7

---

#### T1.9 — Backend tests
Files: `api/internal/orders/*_test.go`, `api/internal/api/handlers/orders_test.go`

- UpsertOrder: insert moi khi chua co
- UpsertOrder: update khi `modified_at_woo` moi hon
- UpsertOrder: bo qua khi `modified_at_woo` bang nhau (idempotent)
- UpsertOrderItems: replace-set dung (xoa cu, insert lai)
- DeriveContact: tao moi khi chua co email
- DeriveContact: merge vao contact cu theo email
- DeriveContact: fallback match theo phone
- DeriveContact: khong merge khi chi co name
- DeriveContact: recompute aggregate dung
- SyncOrders handler: reject thieu `woo_order_id`
- SyncOrders handler: reject thieu `modified_at_woo`
- SyncOrders handler: reject batch > 100
- SyncOrders handler: `X-Order-Sync-Enabled: false` tra 200 voi accepted=0
- SyncOrders handler: `X-Contact-Sync-Enabled: false` push message co flag false

Dep: T1.3, T1.4, T1.5

---

### PHASE 2 — Plugin (can backend Phase 1 chay)

#### T2.1 — Don dep hook trung
File: `/var/www/site1.local/wp-content/plugins/plugin/includes/class-attribution.php`

- Xoa phuong thuc `preserve_attribution_on_checkout()`
- Xoa `add_filter('woocommerce_checkout_order_processed', ...)` khoi constructor
- Giu nguyen cac phuong thuc utility: `get_attribution()`, `get_client_id()`, `get_session_id()`, `get_order_attribution()`

Dep: khong co

---

#### T2.2 — Them class-order-sync.php
File: `/var/www/site1.local/wp-content/plugins/plugin/includes/class-order-sync.php` (file moi)

- Constructor: doc `api_url`, `api_key` tu options
- `sync_order(WC_Order $order): void`
  - kiem tra `woosaas_order_sync_enabled`
  - goi `build_order_payload()` va `send_batch()`
- `build_order_payload(WC_Order $order): array` — 20+ fields theo plan
- `send_batch(array $orders): void` — gui len `/api/v1/woo/orders/sync` voi 2 headers `X-Order-Sync-Enabled`, `X-Contact-Sync-Enabled`
- `map_payment_status(WC_Order): string`
- `map_fulfillment_status(WC_Order): string`
- `extract_billing_address(WC_Order): array`
- `extract_shipping_address(WC_Order): array`
- `get_contact_sync_header(): string`
- `run_backfill_batch(string $cursor_modified_at, int $cursor_order_id): array` — query 50 orders, tra ve `{orders_synced, next_cursor_modified_at, next_cursor_order_id, done}`

Dep: T2.1

---

#### T2.3 — Them order sync hooks vao class-woocommerce.php
File: `/var/www/site1.local/wp-content/plugins/plugin/includes/class-woocommerce.php`

- Them `private $order_sync` property
- Khoi tao `$this->order_sync = new Woosaas_Order_Sync()` trong constructor
- Dang ky 3 hook moi:
  - `woocommerce_order_status_changed` -> `sync_order_on_status_change($order_id, $old, $new, $order)`
  - `woocommerce_order_refunded` -> `sync_order_on_refund($order_id, $refund_id)`
  - `wp_trash_post` -> `sync_order_on_trash($post_id)`
- Implement 3 callback: lay `WC_Order`, goi `$this->order_sync->sync_order($order)`
- `sync_order_on_trash`: kiem tra `get_post_type($post_id) === 'shop_order'` truoc

Dep: T2.2

---

#### T2.4 — Them WordPress options cho toggle sync
File: `/var/www/site1.local/wp-content/plugins/plugin/includes/admin/class-admin.php`

- Them `register_setting` cho `woosaas_order_sync_enabled` (default `yes`)
- Them `register_setting` cho `woosaas_contact_sync_enabled` (default `yes`)
- Them AJAX action `woosaas_backfill_orders`:
  - check nonce + cap quyen
  - kiem tra `woosaas_order_sync_enabled`
  - lay cursor tu options
  - goi `Woosaas_Order_Sync::run_backfill_batch(cursor)`
  - luu cursor moi vao options
  - tra JSON response cho JS tiep tuc neu chua done
- Them submenu `woosaas-sync` voi trang `render_sync_page()`
- Render sync page voi: 2 toggle (Order Sync / Contact Sync), backfill status, nut Start/Resume/Reset

Dep: T2.2

---

#### T2.5 — Load class moi trong woosaas.php
File: `/var/www/site1.local/wp-content/plugins/plugin/woosaas.php`

- Them `require_once WOOSAAS_PLUGIN_DIR . 'includes/class-order-sync.php';` trong `load_dependencies()`
- Them `new Woosaas_Order_Sync()` khong can khoi tao rieng (da khoi tao trong Woosaas_WooCommerce)
- Them 2 constants neu can: `WOOSAAS_ORDER_SYNC_VERSION`, `WOOSAAS_ORDERS_STREAM`

Dep: T2.2, T2.3, T2.4

---

#### T2.6 — Plugin tests
Files: `/var/www/site1.local/wp-content/plugins/plugin/tests/unit/OrderSyncTest.php` (file moi)

- `build_order_payload()` tra dung 20+ fields tu `WC_Order` mock
- `map_payment_status()` mapping dung cho tung status
- `map_fulfillment_status()` mapping dung
- `get_contact_sync_header()` tra `true`/`false` theo option
- `sync_order()` return som khi `woosaas_order_sync_enabled = no`
- `handle_backfill_ajax()` tra loi khi order sync disabled
- `X-Contact-Sync-Enabled` header dung voi option hien tai

Dep: T2.2, T2.4

---

### PHASE 3 — Read APIs

#### T3.1 — Orders List API
File: `api/internal/api/handlers/orders.go` (bo sung)

- `ListOrders(c *gin.Context)`
  - JWT auth (dashboard user)
  - params: `page`, `page_size` (default 20, max 100), `q`, `payment_status`, `fulfillment_status`, `status`, `date_from`, `date_to`
  - goi `repo.ListOrders()`
  - tra `{ orders: [], total: n, page: n, page_size: n }`
- Them route: `dashboard.GET("/sites/:site_id/orders", ordersHandler.ListOrders)` (sau JWT + TenantMiddleware)

Dep: T1.3, T1.6

---

#### T3.2 — Order Detail API
File: `api/internal/api/handlers/orders.go` (bo sung)

- `GetOrder(c *gin.Context)` — param `:woo_order_id`
  - goi `repo.GetOrder()` kem items va contact
  - tra full fields: order + contact + items + billing + shipping + attribution
- Them route: `dashboard.GET("/sites/:site_id/orders/:woo_order_id", ordersHandler.GetOrder)`

Dep: T1.3, T1.6, T3.1

---

#### T3.3 — Contacts List API
File: `api/internal/api/handlers/orders.go` (bo sung) hoac `contacts.go` rieng

- `ListContacts(c *gin.Context)`
  - params: `page`, `page_size`, `q` (search email/name/phone)
  - goi `repo.ListContacts()`
  - tra `{ contacts: [], total: n }`
- Them route: `dashboard.GET("/sites/:site_id/contacts", ordersHandler.ListContacts)`

Dep: T1.3, T1.6

---

#### T3.4 — Sync State API (tuy chon)
File: `api/internal/api/handlers/orders.go`

- `GET /api/v1/sites/:site_id/orders/sync-state`
- Tra `woo_order_sync_state` hien tai cua site
- Dung cho admin page hien thi trang thai backfill

Dep: T1.3

---

### PHASE 4 — Dashboard UI

#### T4.1 — Orders List page
File: `dashboard/src/app/dashboard/[siteId]/orders/page.tsx`

- Table voi 7 cot: Order (#woo_order_id), Date created, Customer, Payment, Fulfillment, Total, Items
- Pagination
- Filter: payment_status, fulfillment_status, date range
- Search (q)
- Link sang order detail

Dep: T3.1

---

#### T4.2 — Order Detail page
File: `dashboard/src/app/dashboard/[siteId]/orders/[orderId]/page.tsx`

- Header: order ID, status badges, dates
- Contact block: ten, email, phone, link sang contact
- Billing / Shipping address
- Items table: SKU, ten, quantity, unit price, total
- Attribution snapshot
- Client/session IDs

Dep: T3.2

---

#### T4.3 — Contacts List page (tuy chon v1)
File: `dashboard/src/app/dashboard/[siteId]/contacts/page.tsx`

- Table: email, ten, phone, orders_count, total_spent, first_seen, last_seen
- Search, pagination

Dep: T3.3

---

#### T4.4 — Navigation update
File: `dashboard/src/lib/navigation.ts` (hoac tuong duong)

- Them `Orders` vao sidebar nav cua site
- Them `Contacts` neu T4.3 duoc lam

Dep: T4.1

---

### Checklist dependency

```
T1.1 -> T1.2 -> T1.3 -> T1.4
                T1.3 -> T1.5 -> T1.6
                T1.3 -> T1.7 -> T1.8
         T1.2 -> T1.9 (sau T1.3, T1.4, T1.5)

T2.1 -> T2.2 -> T2.3
         T2.2 -> T2.4
         T2.2 -> T2.5 (sau T2.3, T2.4)
         T2.2 -> T2.6

T1.3, T1.6 -> T3.1 -> T3.2
                       T3.3
                       T3.4

T3.1 -> T4.1 -> T4.4
T3.2 -> T4.2
T3.3 -> T4.3
```
