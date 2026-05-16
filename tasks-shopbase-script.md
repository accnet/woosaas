# Tasks: ShopBase Tracking Script Install

## Mục tiêu

Triển khai đầy đủ luồng tự chèn Woosaas tracking script vào ShopBase bằng ScriptTag API.

Kết quả mong muốn:

- User connect ShopBase site xong có thể cài tracking script bằng một click.
- Script được cài idempotent, không tạo trùng.
- Script chạy được trên storefront và order status page.
- Nếu thiếu quyền ScriptTag API thì dashboard hiển thị manual snippet fallback.
- Sau khi script chạy, Woosaas nhận được analytics events qua existing `/api/v1/collect`.

---

## Phase 1: Chốt Tracker URL

### 1.1 Public tracker script URL

**Files cần kiểm tra/tạo:**

```text
dashboard/public/tracker.js
hoặc
api/internal/api/handlers/tracker.go
```

- [x] Chốt script public URL chính thức:
  ```text
  https://app.woosaas.com/tracker.js
  ```
- [x] Đảm bảo URL này trả JavaScript thật, không phải 404.
- [x] Script nhận `site_id` từ query string:
  ```text
  /tracker.js?site_id={site_id}
  ```
- [x] Script gửi event về API public:
  ```text
  POST {API_BASE_URL}/api/v1/collect
  ```
- [x] Không hardcode localhost trong production.

Acceptance:

- [ ] Mở `TRACKER_BASE_URL/tracker.js?site_id=test` trả `Content-Type: application/javascript`.
- [ ] Script không throw runtime error khi load trên browser.

---

## Phase 2: Tracker Script Events

### 2.1 Base event collector

**File:** `dashboard/public/tracker.js` hoặc source tương ứng

- [x] Tạo/gắn `client_id` vào localStorage/cookie.
- [x] Tạo `session_id` theo session hiện tại.
- [x] Thu thập fields:
  - `url`
  - `path`
  - `title`
  - `referrer`
  - `utm_source`
  - `utm_medium`
  - `utm_campaign`
  - `utm_content`
  - `utm_term`
  - `screen_width`
  - `screen_height`
  - `language`
  - `timezone`
  - `user_agent`
- [x] Gửi `page_view` khi load.
- [x] Dùng `navigator.sendBeacon` nếu có, fallback `fetch(..., { keepalive: true })`.
- [ ] Thêm retry nhẹ nếu network fail.

Acceptance:

- [ ] Page load trên ShopBase tạo event `page_view` trong Woosaas.
- [ ] Event có `client_id`, `session_id`, URL và UTM.

### 2.2 ShopBase storefront event detection

**File:** tracker script

- [x] Detect `product_view` bằng URL pattern hoặc ShopBase global object nếu có.
- [x] Detect `collection_view` bằng URL pattern.
- [x] Detect `add_to_cart` bằng click listener trên form/button add-to-cart.
- [x] Detect `checkout_started` bằng:
  - checkout URL pattern
  - click checkout button
  - submit cart form
- [x] Detect `order_status_view` trên thank-you/order-status page.

Acceptance:

- [ ] Product page gửi `product_view`.
- [ ] Add-to-cart gửi `add_to_cart`.
- [ ] Checkout page hoặc checkout click gửi `checkout_started`.
- [ ] Order status page gửi `order_status_view`.

---

## Phase 3: Backend ScriptTag Install API

### 3.1 Harden existing endpoint

**File:** `api/internal/api/handlers/shopbase.go`

Endpoint hiện có:

```http
POST /api/v1/sites/:site_id/integration/shopbase/install-script
```

- [x] Check user access to `site_id` trước khi decrypt credentials.
- [x] Build `trackerURL` từ `TRACKER_BASE_URL`:
  ```text
  {TRACKER_BASE_URL}/tracker.js?site_id={site_id}
  ```
- [x] Validate `TRACKER_BASE_URL` là absolute HTTPS URL trong production.
- [x] `GET /admin/script_tags.json` trước.
- [x] Match existing script bằng:
  - same `src`, hoặc
  - same host/path `/tracker.js` và same `site_id`.
- [x] Nếu script đã có: return `already_existed = true`.
- [x] Nếu chưa có: create ScriptTag với:
  ```json
  {
    "script_tag": {
      "event": "onload",
      "src": ".../tracker.js?site_id=...",
      "display_scope": "all"
    }
  }
  ```
- [x] Nếu API trả 401/403: return fallback snippet.
- [x] Không log API key/password.

Response success:

```json
{
  "installed": true,
  "script_tag_id": 123,
  "already_existed": false,
  "src": "https://app.woosaas.com/tracker.js?site_id=..."
}
```

Response fallback:

```json
{
  "installed": false,
  "reason": "permission_required",
  "fallback_snippet": "<script async src=\"...\"></script>"
}
```

Acceptance:

- [ ] Gọi endpoint nhiều lần không tạo duplicate ScriptTag.
- [ ] Response trả `src` để dashboard hiển thị/debug.

### 3.2 Add script status API

**File:** `api/internal/api/handlers/shopbase.go`

Add endpoint hoặc mở rộng existing integration status:

```http
GET /api/v1/sites/:site_id/integration
```

Return thêm:

```json
{
  "script_tag": {
    "installed": true,
    "script_tag_id": 123,
    "src": "https://app.woosaas.com/tracker.js?site_id=..."
  }
}
```

- [x] Khi gọi status, backend có thể list ScriptTags và detect Woosaas script.
- [x] Nếu lỗi permission, return `installed: false`, `reason: "permission_required"`.
- [ ] Cache short TTL nếu cần tránh gọi ShopBase API quá nhiều.

Acceptance:

- [ ] Dashboard refresh page vẫn biết script đã cài hay chưa.

---

## Phase 4: ShopBase Client Tests

**Files:**

```text
api/internal/shopbase/client_test.go
api/internal/api/handlers/shopbase_test.go
```

- [ ] Test `ListScriptTags` parse response đúng.
- [ ] Test `CreateScriptTag` gửi payload đúng:
  - `event = onload`
  - `display_scope = all`
  - `src` đúng.
- [ ] Test 401/403 map sang permission error.
- [ ] Test install idempotency:
  - existing exact src -> không create.
  - no existing src -> create.
- [ ] Test không leak credentials trong error response.

Acceptance:

```bash
go test ./internal/shopbase ./internal/api/handlers
```

---

## Phase 5: Dashboard UX

### 5.1 Integration page checklist

**File:** `dashboard/src/app/dashboard/[siteId]/integrations/page.tsx`

- [x] Hiển thị card `Tracking script`.
- [x] States:
  - `Installed`
  - `Missing`
  - `Installing`
  - `Permission required`
  - `Error`
- [x] Button `Install Script`.
- [x] Khi success:
  - show installed status
  - show script tag id hoặc src nhỏ gọn.
- [x] Khi permission required:
  - show manual snippet readonly
  - add copy button.
- [x] Sau install gọi lại status API để refresh.

Acceptance:

- [ ] User nhìn được script status rõ ràng.
- [ ] Không cần rời dashboard để biết đã cài hay chưa.

### 5.2 Add-site post-connect flow

**File:** `dashboard/src/app/dashboard/sites/page.tsx`

- [ ] Sau khi connect ShopBase thành công, redirect hoặc show checklist:
  - Install tracking script
  - Register webhooks
  - Start backfill
- [ ] CTA chính là `Install tracking script`.
- [ ] Nếu user bỏ qua, vẫn vào được `/dashboard/{siteId}/integrations`.

Acceptance:

- [ ] Connect xong user có bước tiếp theo rõ ràng.

---

## Phase 6: Verification Flow

### 6.1 Tracking verification after install

**Existing route:**

```http
GET /api/v1/collect/verify
```

- [x] Sau khi script gửi event đầu tiên, update `tracking_verifications`.
- [ ] Integration page hoặc Health page hiển thị:
  - Last script event
  - Last checked
  - Verified/Pending
- [ ] Nếu script installed nhưng chưa có event, show `Installed, waiting for first event`.

Acceptance:

- [ ] Install Script không đồng nghĩa Verified; Verified chỉ khi event thật về.

### 6.2 Debug event

**Existing route:** dashboard debug event nếu có

- [ ] Cho phép gửi debug event để test collector.
- [ ] Không dùng debug event thay cho storefront verification.

---

## Phase 7: Production Config

**Files:**

```text
.env
docker-compose.yml
api/internal/config/config.go
```

- [x] `TRACKER_BASE_URL` trỏ về public dashboard/app domain.
- [x] `API_BASE_URL` trỏ về public API domain để script gửi event và webhook callback.
- [x] Dev defaults vẫn hoạt động local.
- [x] Production reject install nếu `TRACKER_BASE_URL` không phải HTTPS.

Example:

```env
TRACKER_BASE_URL=https://app.woosaas.com
API_BASE_URL=https://api.woosaas.com
```

Acceptance:

- [ ] ShopBase storefront thật load được script qua HTTPS.

---

## Phase 8: Manual QA

### 8.1 ShopBase test store

- [ ] Connect ShopBase private app credential.
- [ ] Click Install Script.
- [ ] Confirm ScriptTag exists in ShopBase via API/admin.
- [ ] Open storefront homepage.
- [ ] Confirm `page_view` event arrives.
- [ ] Open product page.
- [ ] Confirm `product_view`.
- [ ] Add to cart.
- [ ] Confirm `add_to_cart`.
- [ ] Start checkout.
- [ ] Confirm `checkout_started`.
- [ ] Create test order.
- [ ] Confirm order comes from API/webhook, not only browser event.

### 8.2 Failure cases

- [ ] Invalid credentials -> clear error.
- [ ] Missing `write_script_tags` permission -> fallback snippet.
- [ ] Duplicate install -> no duplicate tags.
- [ ] Deleted script in ShopBase -> status becomes Missing.
- [ ] API timeout -> dashboard shows retryable error.

---

## Definition Of Done

- [x] Script can be installed from dashboard.
- [x] Script install is idempotent.
- [x] Script status is visible after page reload.
- [x] Manual snippet fallback works.
- [x] First real event verifies tracking.
- [x] ShopBase order/revenue still comes from API/webhook.
- [x] `go test ./...` pass.
- [x] `npm run build` pass.
