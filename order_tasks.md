# Order Tasks + Order Activity Plan

## Goal

Thiết kế `Order Activity` trong trang chi tiết order thành một timeline vận hành thật, kết hợp:

- activity/log từ order sync, payment, tracking, fulfillment
- internal notes của team
- tasks phục vụ xử lý đơn POD
- workflow design / review / update design / push fulfillment
- khả năng mở rộng để đẩy fulfillment qua API bên thứ 3

Nguyên tắc chính:

- `order_tasks` là việc cần làm và có trạng thái hiện tại.
- `order_activity_events` là lịch sử append-only, không sửa.
- `commerce_orders.status` vẫn là lifecycle tổng quát của đơn hàng, không dùng để chứa mọi bước vận hành POD.
- Shipment tracking tiếp tục dùng domain `shipment_tracking`; khi có thay đổi thì ghi thêm activity event.

---

## Current Context

Hệ thống hiện có:

- `commerce_orders`
- `commerce_order_items`
- order detail dashboard
- `Order Activity` UI hiện tại đang render từ timestamp có sẵn:
  - order created
  - payment captured
  - order fulfilled
  - snapshot updated
- shipment tracking đã có bảng `shipment_trackings` và API add/refresh/delete.
- `process.md` đã định nghĩa lifecycle order:
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

Vấn đề:

- Order Activity hiện chỉ là timeline tĩnh.
- Chưa có nơi lưu internal note.
- Chưa có task để quản lý các bước xử lý POD.
- Chưa có audit/event chuẩn khi tracking, design, fulfill thay đổi.

---

## Domain Model

### 1. Order Task

Task đại diện cho một việc cần làm để hoàn tất order.

Ví dụ:

- thiết kế artwork
- review design
- update design
- chuẩn bị mockup
- push fulfillment
- xử lý lỗi provider
- thêm tracking
- manual review

Task có trạng thái hiện tại và có thể gắn với cả order hoặc line item.

### 2. Order Activity Event

Activity event đại diện cho một việc đã xảy ra.

Ví dụ:

- order được sync vào hệ thống
- payment captured
- task được tạo
- task đổi trạng thái
- internal note được thêm
- design được upload
- fulfillment được submit
- tracking number được thêm
- carrier báo delivered

Activity event là append-only. Không update nội dung event cũ, trừ khi cần xóa mềm vì compliance ở phase sau.

### 3. Fulfillment Job

Phase nâng cao, khi push fulfill qua API bên thứ 3, nên có bảng riêng cho job.

Task trả lời: team đang cần làm gì?  
Fulfillment job trả lời: request sang provider đang ở trạng thái nào?

---

## Data Model

### Migration

Đề xuất migration:

```text
api/migrations_postgres/016_order_tasks_activity.sql
```

Nếu các migration platform admin trong `plan-platform.md` cũng dùng `016+`, khi triển khai thực tế cần chọn số tiếp theo theo repo.

### `order_tasks`

```sql
CREATE TABLE IF NOT EXISTS order_tasks (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id             UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    source_platform     VARCHAR(30) NOT NULL DEFAULT 'woocommerce',
    woo_order_id        TEXT NOT NULL,
    line_item_id        TEXT,

    type                VARCHAR(50) NOT NULL,
    title               TEXT NOT NULL,
    description         TEXT,
    status              VARCHAR(30) NOT NULL DEFAULT 'todo',
    priority            VARCHAR(20) NOT NULL DEFAULT 'normal',

    assignee_id         UUID,
    created_by          UUID,
    due_at              TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,

    provider            VARCHAR(50),
    provider_job_id     TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}',

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (status IN (
        'todo',
        'in_progress',
        'waiting',
        'needs_update',
        'blocked',
        'ready',
        'completed',
        'failed',
        'cancelled'
    )),
    CHECK (priority IN ('low', 'normal', 'high', 'urgent'))
);

CREATE INDEX IF NOT EXISTS idx_order_tasks_order
    ON order_tasks(site_id, source_platform, woo_order_id);

CREATE INDEX IF NOT EXISTS idx_order_tasks_status
    ON order_tasks(site_id, status);

CREATE INDEX IF NOT EXISTS idx_order_tasks_assignee
    ON order_tasks(assignee_id)
    WHERE assignee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_tasks_due_at
    ON order_tasks(due_at)
    WHERE due_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_tasks_provider_job
    ON order_tasks(provider, provider_job_id)
    WHERE provider_job_id IS NOT NULL;
```

### `order_activity_events`

```sql
CREATE TABLE IF NOT EXISTS order_activity_events (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id             UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    source_platform     VARCHAR(30) NOT NULL DEFAULT 'woocommerce',
    woo_order_id        TEXT NOT NULL,
    task_id             UUID REFERENCES order_tasks(id) ON DELETE SET NULL,
    line_item_id        TEXT,

    type                VARCHAR(80) NOT NULL,
    title               TEXT NOT NULL,
    message             TEXT,

    actor_type          VARCHAR(30) NOT NULL DEFAULT 'system',
    actor_id            UUID,
    source              VARCHAR(50) NOT NULL DEFAULT 'system',
    metadata            JSONB NOT NULL DEFAULT '{}',

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (actor_type IN ('system', 'user', 'provider', 'customer')),
    CHECK (source IN (
        'order_sync',
        'dashboard',
        'task',
        'shipment_tracking',
        'fulfillment',
        'provider_webhook',
        'system'
    ))
);

CREATE INDEX IF NOT EXISTS idx_order_activity_events_order
    ON order_activity_events(site_id, source_platform, woo_order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_activity_events_task
    ON order_activity_events(task_id)
    WHERE task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_activity_events_type
    ON order_activity_events(site_id, type, created_at DESC);
```

### Optional Phase 3: `order_fulfillment_jobs`

```sql
CREATE TABLE IF NOT EXISTS order_fulfillment_jobs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id             UUID REFERENCES order_tasks(id) ON DELETE SET NULL,
    site_id             UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    source_platform     VARCHAR(30) NOT NULL DEFAULT 'woocommerce',
    woo_order_id        TEXT NOT NULL,

    provider            VARCHAR(50) NOT NULL,
    provider_job_id     TEXT,
    status              VARCHAR(30) NOT NULL DEFAULT 'queued',

    request_payload     JSONB NOT NULL DEFAULT '{}',
    response_payload    JSONB NOT NULL DEFAULT '{}',
    error_message       TEXT,

    submitted_at        TIMESTAMPTZ,
    last_synced_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (status IN (
        'queued',
        'submitted',
        'accepted',
        'in_production',
        'shipped',
        'failed',
        'cancelled'
    ))
);

CREATE INDEX IF NOT EXISTS idx_order_fulfillment_jobs_order
    ON order_fulfillment_jobs(site_id, source_platform, woo_order_id);

CREATE INDEX IF NOT EXISTS idx_order_fulfillment_jobs_provider
    ON order_fulfillment_jobs(provider, provider_job_id)
    WHERE provider_job_id IS NOT NULL;
```

---

## Task Types

Canonical task types giai đoạn đầu:

```text
design_required
design_in_progress
design_review
design_needs_update
mockup_ready
push_fulfillment
fulfillment_queued
fulfillment_submitted
tracking_required
manual_review
customer_issue
```

Gợi ý dùng:

- `design_required`: order/line item cần artwork.
- `design_review`: artwork đã có, cần review.
- `design_needs_update`: review fail hoặc khách/provider yêu cầu chỉnh.
- `push_fulfillment`: cần gửi order sang fulfillment provider.
- `tracking_required`: đã fulfill nhưng chưa có tracking.
- `manual_review`: dữ liệu thiếu, SKU không map, địa chỉ lỗi, hoặc automation không chắc chắn.

Không cần tạo type riêng cho mọi trạng thái nhỏ. Chi tiết có thể nằm trong `metadata`.

---

## Activity Event Types

Canonical event types giai đoạn đầu:

```text
order_created
order_synced
order_snapshot_updated
payment_captured
order_status_changed
internal_note_added

task_created
task_updated
task_status_changed
task_completed
task_failed
task_cancelled

design_uploaded
design_updated
design_review_requested
design_approved
design_rejected

fulfillment_push_started
fulfillment_submitted
fulfillment_failed
fulfillment_status_updated

tracking_added
tracking_refreshed
tracking_deleted
tracking_status_changed
wc_push_succeeded
wc_push_failed
```

Event nên có `title` ngắn để UI render nhanh, còn chi tiết nằm trong `message` và `metadata`.

---

## Backend Structure

Tạo package:

```text
api/internal/order_activity/
    repository.go
    service.go
    types.go
```

### Responsibility

`repository.go`

- CRUD task
- list activity events
- insert activity event
- transaction helper cho task update + event insert

`service.go`

- validate transitions
- tạo event khi task đổi trạng thái
- tạo internal note
- expose helper cho domain khác ghi activity:
  - order sync
  - shipment tracking
  - fulfillment provider

`types.go`

- constants cho status/type/source
- request/response DTOs

---

## Backend API

Routes JWT-protected:

```text
GET    /api/v1/sites/:site_id/orders/:woo_order_id/activity
GET    /api/v1/sites/:site_id/orders/:woo_order_id/tasks
POST   /api/v1/sites/:site_id/orders/:woo_order_id/tasks
PATCH  /api/v1/sites/:site_id/orders/:woo_order_id/tasks/:task_id
POST   /api/v1/sites/:site_id/orders/:woo_order_id/notes
POST   /api/v1/sites/:site_id/orders/:woo_order_id/tasks/:task_id/events
```

### List Activity

```text
GET /api/v1/sites/:site_id/orders/:woo_order_id/activity
```

Query params:

- `limit`, default `50`
- `before`, optional cursor/timestamp
- `type`, optional

Response:

```json
{
  "events": [],
  "next_cursor": null
}
```

### List Tasks

```text
GET /api/v1/sites/:site_id/orders/:woo_order_id/tasks
```

Query params:

- `status=open|done|all`

`open` maps to:

```text
todo,in_progress,waiting,needs_update,blocked,ready,failed
```

`done` maps to:

```text
completed,cancelled
```

### Create Task

```text
POST /api/v1/sites/:site_id/orders/:woo_order_id/tasks
```

Body:

```json
{
  "type": "design_required",
  "title": "Prepare artwork",
  "description": "Need updated front print file.",
  "line_item_id": "123",
  "priority": "normal",
  "assignee_id": null,
  "due_at": null,
  "metadata": {}
}
```

Behavior:

- create row in `order_tasks`
- insert `task_created` event in same transaction

### Update Task

```text
PATCH /api/v1/sites/:site_id/orders/:woo_order_id/tasks/:task_id
```

Body partial:

```json
{
  "status": "in_progress",
  "title": "Prepare artwork",
  "priority": "high",
  "assignee_id": null,
  "due_at": null,
  "metadata": {}
}
```

Behavior:

- update task
- if status changed, insert `task_status_changed`
- if status becomes `completed`, set `completed_at`
- if status moves away from `completed`, clear `completed_at`

### Add Internal Note

```text
POST /api/v1/sites/:site_id/orders/:woo_order_id/notes
```

Body:

```json
{
  "message": "Customer confirmed the revised artwork."
}
```

Behavior:

- insert `internal_note_added` event
- no task required

---

## Task State Rules

Allowed practical transitions:

```text
todo -> in_progress
todo -> waiting
todo -> blocked
todo -> cancelled

in_progress -> waiting
in_progress -> needs_update
in_progress -> ready
in_progress -> completed
in_progress -> failed
in_progress -> blocked
in_progress -> cancelled

waiting -> in_progress
waiting -> needs_update
waiting -> completed
waiting -> failed
waiting -> cancelled

needs_update -> in_progress
needs_update -> waiting
needs_update -> cancelled

blocked -> in_progress
blocked -> waiting
blocked -> cancelled

ready -> in_progress
ready -> completed
ready -> cancelled

failed -> in_progress
failed -> cancelled

completed -> in_progress
completed -> needs_update
completed -> cancelled
```

Giai đoạn đầu có thể không enforce quá chặt ở DB, enforce trong service.

---

## POD Workflow

### Auto-create tasks on order sync

Khi order sync về, service kiểm tra line items.

Điều kiện nhận diện POD giai đoạn đầu:

- SKU prefix/suffix theo cấu hình
- item meta có key liên quan design/artwork
- product/variant metadata trong `variant_attributes`
- manual fallback từ dashboard

Phase đầu có thể bắt đầu bằng manual task, sau đó mới auto detect.

### Basic workflow

```text
order_created
  -> create task design_required

designer starts task
  -> task status in_progress
  -> event task_status_changed

design uploaded
  -> event design_uploaded
  -> task status ready

review rejected
  -> task status needs_update
  -> event design_rejected

review approved
  -> task status completed
  -> event design_approved
  -> create task push_fulfillment

push fulfillment
  -> task status waiting
  -> event fulfillment_push_started

provider accepted
  -> task status completed
  -> event fulfillment_submitted
  -> create task tracking_required

tracking added
  -> event tracking_added
  -> task tracking_required completed
```

---

## Shipment Tracking Integration

Khi gọi shipment tracking service hiện tại:

### Add tracking

Trong `shipment_tracking.Service.Add`:

- sau khi create tracking thành công, insert activity:
  - `type = tracking_added`
  - `source = shipment_tracking`
  - metadata gồm tracking id, number, carrier, status
- nếu WC push ok:
  - insert `wc_push_succeeded`
- nếu WC push fail:
  - insert `wc_push_failed`

### Refresh tracking

Trong `shipment_tracking.Service.Refresh`:

- nếu status thay đổi, insert:
  - `tracking_status_changed`
- nếu chỉ refresh không đổi status:
  - có thể insert `tracking_refreshed`, hoặc bỏ qua để timeline không nhiễu.

### Delete tracking

Trong `shipment_tracking.Service.Delete`:

- insert `tracking_deleted`

---

## Order Sync Integration

Khi order được upsert:

- lần đầu thấy order:
  - insert `order_created`
  - nếu có `paid_at_woo`, insert `payment_captured`
  - nếu detect POD, create initial tasks

- lần sau snapshot thay đổi:
  - insert `order_snapshot_updated` nếu meaningful fields changed
  - nếu payment status đổi sang paid, insert `payment_captured`
  - nếu lifecycle status đổi, insert `order_status_changed`

Giai đoạn đầu nếu diff phức tạp, chỉ insert activity từ dashboard/task/tracking trước. Order sync activity có thể làm phase 2 để tránh timeline bị spam khi backfill.

---

## Fulfillment Provider Integration

Phase 3 thêm interface:

```go
type FulfillmentProvider interface {
    SubmitOrder(ctx context.Context, input SubmitOrderInput) (*SubmitOrderResult, error)
    GetJob(ctx context.Context, providerJobID string) (*FulfillmentJobStatus, error)
}
```

Flow push fulfillment:

1. User bấm `Push fulfill` trên task.
2. API tạo `order_fulfillment_jobs` status `queued`.
3. Worker gọi provider API.
4. Insert `fulfillment_push_started`.
5. Nếu provider accepted:
   - job status `submitted` hoặc `accepted`
   - task status `waiting` hoặc `completed`
   - insert `fulfillment_submitted`
6. Nếu provider lỗi:
   - job status `failed`
   - task status `failed`
   - insert `fulfillment_failed`

Provider webhook:

- validate signature
- update fulfillment job
- insert `fulfillment_status_updated`
- nếu provider trả tracking, gọi shipment tracking service để tạo tracking

---

## Dashboard UX

Trong order detail, thay `Order Activity` hiện tại bằng layout:

```text
Order Activity
  [Internal note composer]

  Open Tasks
    - task title
    - status chip
    - priority
    - assignee
    - due date
    - quick actions

  Timeline
    - activity event list
```

### Open Tasks

Hiển thị trước timeline để user biết cần làm gì ngay.

Task row:

- icon theo type
- title
- line item nếu có
- status chip
- priority
- due date
- action menu:
  - Start
  - Mark ready
  - Needs update
  - Complete
  - Cancel
  - Push fulfill nếu task type là `push_fulfillment`

### Timeline

Sort mới nhất trước như UI hiện tại.

Event style:

- `internal_note_added`: note block nhẹ
- `task_*`: task icon
- `tracking_*`: shipment icon
- `fulfillment_*`: package/send icon
- `order_*`: receipt icon

Không dùng timeline để chỉnh trạng thái. Chỉnh trạng thái qua task controls.

---

## Frontend Types

Thêm trong `dashboard/src/lib/types.ts`:

```ts
export interface OrderTask {
  id: string
  site_id: string
  source_platform: string
  woo_order_id: string
  line_item_id?: string | null
  type: string
  title: string
  description?: string | null
  status: string
  priority: string
  assignee_id?: string | null
  due_at?: string | null
  completed_at?: string | null
  provider?: string | null
  provider_job_id?: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface OrderActivityEvent {
  id: string
  site_id: string
  source_platform: string
  woo_order_id: string
  task_id?: string | null
  line_item_id?: string | null
  type: string
  title: string
  message?: string | null
  actor_type: string
  actor_id?: string | null
  source: string
  metadata: Record<string, unknown>
  created_at: string
}
```

Thêm API client trong `dashboard/src/lib/api.ts`:

```ts
listOrderTasks(siteId, wooOrderId, status?)
createOrderTask(siteId, wooOrderId, data)
updateOrderTask(siteId, wooOrderId, taskId, data)
listOrderActivity(siteId, wooOrderId, params?)
addOrderNote(siteId, wooOrderId, data)
```

---

## Implementation Phases

### Phase 1: Manual Tasks + Notes + Timeline

- Add migration for `order_tasks` and `order_activity_events`.
- Add backend package `order_activity`.
- Add handlers and routes.
- Add manual task CRUD.
- Add internal note endpoint.
- Update order detail UI:
  - load tasks
  - load activity
  - submit note
  - create/update task
- Keep old timestamp-derived activity as fallback if no events exist.

### Phase 2: Domain Events From Existing Flows

- Insert activity events from shipment tracking add/refresh/delete.
- Insert activity when WC push succeeds/fails.
- Insert activity from order sync for new order/payment/status changes.
- Auto-create `tracking_required` task when order is fulfilled but no tracking exists.

### Phase 3: POD Automation

- Detect POD line items.
- Auto-create `design_required` per order or per line item.
- Add task templates/settings per site.
- Add design artifact metadata:
  - file URL
  - version
  - notes
  - approved by
  - approved at

### Phase 4: Fulfillment Provider API

- Add `order_fulfillment_jobs`.
- Add provider interface.
- Add worker queue for async fulfillment submission.
- Add provider webhook/refresh.
- Map provider status to task status and activity events.
- If provider returns tracking, create shipment tracking automatically.

---

## Rollout Notes

- Do not backfill every historical order immediately; it can pollute activity timeline.
- Start writing activity only for new manual/dashboard actions.
- Add order sync events after meaningful diff logic is ready.
- Keep activity insert best-effort for non-critical flows like tracking WC push result.
- For task update + activity event, use one transaction.
- Do not expose provider secrets or raw payloads in normal activity response.
- Store sensitive provider request/response only in fulfillment job table if needed, and redact before UI.

---

## Open Questions

- Task should be per order by default, or per line item for every POD item?
- Do we need real assignee from `users_members`, or leave `assignee_id` nullable until tenant member model is implemented?
- Should design files be stored in app storage, external URL, or only metadata reference from provider?
- Which fulfillment provider should be first integration?
- Should `push_fulfillment` be one task per order or per line item/vendor?

