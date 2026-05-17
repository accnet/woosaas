# Order Status Process Plan

## Goal

Thiết kế một tiến trình trạng thái đơn hàng thống nhất cho hệ thống hiện tại, nơi:

- order chủ yếu được sync về từ WooCommerce / ShopBase
- phần lớn order vào hệ thống ở trạng thái `paid`
- ban đầu nhiều order là `unfulfilled`
- trạng thái tiếp theo được đẩy bởi shipment tracking / provider APIs

Mục tiêu UI:

- hiển thị một cột `Status` riêng trong danh sách Orders
- hiển thị tiến trình trực quan trong trang chi tiết Order
- tách rõ `status`, `payment_status`, `fulfillment_status`

## Current State

Hiện tại hệ thống đã có:

- `status`
- `payment_status`
- `fulfillment_status`

Nhưng semantics chưa đủ chặt:

- `payment_status` và `fulfillment_status` khá rõ
- `status` hiện đang là derived field, chưa được dùng như lifecycle chuẩn
- UI Orders list đang nhấn mạnh Payment / Fulfillment nhiều hơn Status
- Order detail đã có activity/time blocks nhưng chưa có progress flow chuẩn

## Proposed Canonical Status Model

`status` sẽ được giữ như **order lifecycle status**, nhưng lifecycle này bám vào tiến trình vận hành sau khi order đã được tạo và trả tiền.

### Canonical statuses

- `processing`
- `fulfilled`
- `in_transit`
- `out_for_delivery`
- `delivered`
- `exception`
- `failed_delivery`
- `returned`
- `cancelled`
- `refunded`

### Meaning

- `processing`
  - Order đã vào hệ thống
  - Đã paid hoặc đủ điều kiện xử lý
  - Chưa có shipment thực tế

- `fulfilled`
  - Đã tạo fulfillment hoặc đã nhập tracking
  - Hàng đã được bàn giao sang luồng giao vận

- `in_transit`
  - Carrier đã nhận hàng

- `out_for_delivery`
  - Hàng đang giao chặng cuối

- `delivered`
  - Giao thành công

- `exception`
  - Carrier báo lỗi / hold / delay / customs / address issue

- `failed_delivery`
  - Giao không thành công

- `returned`
  - Hàng bị hoàn về / return to sender

- `cancelled`
  - Order bị hủy

- `refunded`
  - Order đã refund và được coi là kết thúc theo hướng tài chính

## Separation Of Concerns

### 1. `status`

Trả lời câu hỏi:

- order đang ở bước nào trong tiến trình vận hành

### 2. `payment_status`

Trả lời câu hỏi:

- tiền đã thu chưa

Canonical values nên giữ gần platform raw data:

- `paid`
- `pending`
- `failed`
- `cancelled`
- `refunded`
- `partially_refunded`
- `voided`

### 3. `fulfillment_status`

Trả lời câu hỏi:

- fulfillment đã được tạo / hoàn tất chưa

Canonical values:

- `unfulfilled`
- `partial`
- `fulfilled`

## Lifecycle Rules

### Initial order sync

Khi order mới sync về:

- nếu `payment_status = paid`
- và `fulfillment_status = unfulfilled`
- thì set:
  - `status = processing`

### When tracking is added

Khi user nhập tracking hoặc plugin push tracking:

- nếu order chưa bị `cancelled` / `refunded`
- thì set:
  - `fulfillment_status = fulfilled`
  - `status = fulfilled`

### When provider tracking updates arrive

Mapping carrier updates:

- first carrier acceptance scan -> `in_transit`
- out for delivery -> `out_for_delivery`
- delivered -> `delivered`
- exception / delay / customs / unavailable -> `exception`
- failed attempt -> `failed_delivery`
- return to sender / returned -> `returned`

### Override rules

- `cancelled` thắng các trạng thái vận chuyển trước đó
- `refunded` có thể override `delivered` hoặc `fulfilled` nếu business muốn status cuối theo tài chính
- `returned` không tự imply `refunded`

## Data Model Changes

## Database

Giữ nguyên cột hiện có trước:

- `commerce_orders.status`
- `commerce_orders.payment_status`
- `commerce_orders.fulfillment_status`

Giai đoạn đầu không cần thêm cột mới.

### Optional phase 2

Nếu cần timeline chuẩn hơn, thêm các timestamp:

- `fulfilled_at`
- `in_transit_at`
- `out_for_delivery_at`
- `delivered_at`
- `exception_at`
- `returned_at`

Nhưng giai đoạn đầu có thể suy ra từ:

- tracking checkpoints
- provider status updates
- existing order timestamps

## Backend Work

### 1. Centralize status transition logic

Tạo một package riêng, ví dụ:

```text
api/internal/order_status/
    mapper.go
    transition.go
    timeline.go
```

Responsibility:

- normalize `status`
- map provider statuses
- enforce transition rules
- avoid status writes rải rác

### 2. Normalize inbound order sync

Nguồn:

- Woo order sync
- ShopBase sync

Rule:

- canonicalize `status` on ingest
- không để mỗi platform tự ghi status theo style riêng

### 3. Tie shipment tracking to order status

Ở `shipment_tracking` service:

- add tracking -> update order `status = fulfilled`
- refresh / webhook update -> map shipment status -> update order `status`

### 4. Provider mapping tables

Tạo mapping rõ cho:

- AfterShip
- 17TRACK
- TrackingMore

Ví dụ:

| Provider raw | Canonical status |
| --- | --- |
| `InfoReceived` | `fulfilled` |
| `InTransit` | `in_transit` |
| `OutForDelivery` | `out_for_delivery` |
| `Delivered` | `delivered` |
| `Exception` | `exception` |
| `FailedAttempt` | `failed_delivery` |
| `Returned` | `returned` |

## Orders List UI Plan

## Goal

Hiển thị thêm cột `Status` ngoài các cột:

- Payment
- Fulfillment

### Column order

Đề xuất:

- Order
- Date
- Status
- Payment
- Fulfillment
- Total
- Delivery
- Shipping
- Customer
- Items

Hoặc nếu muốn tiết kiệm ngang:

- Order
- Date
- Status
- Total
- Payment
- Fulfillment
- Shipping
- Customer

### Badge system

`Status` badge riêng:

- `processing` -> neutral / gray-blue
- `fulfilled` -> gray
- `in_transit` -> blue
- `out_for_delivery` -> purple or indigo
- `delivered` -> green
- `exception` -> amber
- `failed_delivery` -> red
- `returned` -> slate
- `cancelled` -> red
- `refunded` -> red or muted red

### UX rules

- `Status` là cột chính cho tiến trình order
- `Payment` và `Fulfillment` vẫn giữ riêng
- không merge 3 field này thành một badge

## Order Detail UI Plan

## Goal

Hiển thị tiến trình trực quan, không chỉ là vài badge rời rạc.

### New section

Thêm section:

- `Order progress`

Vị trí:

- trên phần shipment tracking
- hoặc gần phần summary/status header

### Visual model

Dùng progress stepper / timeline ngang hoặc dọc:

1. `Processing`
2. `Fulfilled`
3. `In transit`
4. `Out for delivery`
5. `Delivered`

Mỗi step có 3 state:

- done
- current
- pending

### Exception states

Nếu `status` là:

- `exception`
- `failed_delivery`
- `returned`
- `cancelled`
- `refunded`

thì:

- hiển thị branch state hoặc warning banner
- stepper chính vẫn giữ context, nhưng step hiện tại highlight trạng thái ngoại lệ

### Detail content

Trong `Order progress` nên có:

- current status badge
- current step label
- last status update time
- latest tracking provider / carrier checkpoint
- reason text nếu là `exception` / `failed_delivery`

### Optional phase 2

Thêm timeline event list:

- Order synced
- Tracking added
- Carrier picked up
- In transit
- Out for delivery
- Delivered

## API Response Changes

### Orders list

Giữ `status` trong response và bắt đầu hiển thị rõ hơn ở UI.

### Order detail

Thêm computed object:

```json
{
  "order_progress": {
    "current_status": "in_transit",
    "steps": [
      { "key": "processing", "state": "done", "at": "..." },
      { "key": "fulfilled", "state": "done", "at": "..." },
      { "key": "in_transit", "state": "current", "at": "..." },
      { "key": "out_for_delivery", "state": "pending", "at": null },
      { "key": "delivered", "state": "pending", "at": null }
    ],
    "exception_reason": null
  }
}
```

Computed này có thể build ở backend hoặc frontend.

Khuyến nghị:

- phase 1: compute ở frontend từ `status` + tracking list
- phase 2: move sang backend nếu logic trở nên phức tạp

## Implementation Phases

### Phase 1 — Canonicalization

- define canonical status enum
- centralize mapping logic
- map order sync + tracking updates into canonical statuses
- keep existing DB schema

### Phase 2 — Orders list

- add `Status` column
- add badge colors
- optional filter by `status`

### Phase 3 — Order detail progress

- build `Order progress` section
- stepper + current status
- exception banner

### Phase 4 — Provider parity

- unify AfterShip / 17TRACK / TrackingMore mappings
- verify edge cases: returned, failed delivery, exception

### Phase 5 — Data migration

- backfill existing orders
- normalize old statuses:
  - `paid + unfulfilled` -> `processing`
  - tracking exists but no carrier event -> `fulfilled`
  - shipment provider statuses -> mapped canonical statuses

## Edge Cases

- order paid but no tracking for a long time
  - keep `processing`

- multiple tracking numbers on same order
  - choose most advanced shipment state as order `status`
  - example: one package delivered, one in transit -> order stays `in_transit`

- partial fulfillment
  - keep `fulfillment_status = partial`
  - `status` stays `processing` or `in_transit` depending on tracking evidence

- delivered then refunded
  - business rule needed:
    - either keep `status = delivered`, `payment_status = refunded`
    - or override `status = refunded`
  - khuyến nghị cho vận hành logistics: giữ `status = delivered`, để refund nằm ở `payment_status`

## Recommendation

Cho hệ thống này, rule thực dụng nhất là:

- `status` phản ánh **logistics / operational progress**
- `payment_status` phản ánh **finance**
- `fulfillment_status` phản ánh **fulfillment creation state**

Do đó:

- không dùng `refunded` làm trạng thái chính mặc định nếu order đã delivered
- chỉ override sang `refunded` khi business muốn coi tài chính là trạng thái cuối cùng

Khuyến nghị mặc định:

- delivered + refunded => `status = delivered`, `payment_status = refunded`

## Task Breakdown

### Backend

- [ ] Define canonical status constants
- [ ] Create centralized transition helper
- [ ] Normalize Woo sync -> canonical status
- [ ] Normalize ShopBase sync -> canonical status
- [ ] Map tracking add -> `fulfilled`
- [ ] Map provider tracking statuses -> lifecycle status
- [ ] Add tests for transitions

### Dashboard Orders List

- [ ] Add `Status` column
- [ ] Add lifecycle badge styles
- [ ] Add optional `status` filter
- [ ] Verify table width / responsive behavior

### Dashboard Order Detail

- [ ] Add `Order progress` section
- [ ] Render stepper from current status
- [ ] Show current step + timestamp
- [ ] Show exception banner when needed
- [ ] Show latest carrier checkpoint

### Data

- [ ] Backfill old orders
- [ ] Validate mixed-status legacy rows

## Acceptance Criteria

- Orders list shows a dedicated `Status` column
- `Status` is independent from `Payment` and `Fulfillment`
- Order detail shows a clear progress flow
- Tracking updates move order status automatically
- Existing paid/unfulfilled synced orders normalize to `processing`
- Delivered orders are visually distinct from merely fulfilled ones
