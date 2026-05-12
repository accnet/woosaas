# Plan 1 - Hoan thien order sync va tracking don

## 1. Muc tieu

Hoan thien va khoa chat hai luong du lieu giua `site1.local` va `woosaas`:

1. Khi co order moi tren `site1.local`, plugin phai day snapshot sang Woosaas ngay, sau do backend materialize vao PostgreSQL.
2. Purchase tracking duoc ghi dung vao ClickHouse de analytics doanh thu va funnel dung nghiep vu.
3. Backfill co trang thai server-side ro rang, dashboard doc duoc tien do that.
4. Co bo smoke test va regression test de xac nhan pipeline tiep tuc hoat dong sau nay.

## 2. Hien trang da xac nhan

### 2.1. Order sync

Pipeline backend da co:

```text
plugin -> POST /api/v1/woo/orders/sync
       -> Redis orders:stream
       -> worker
       -> PostgreSQL
```

Backend dang co:

- route `/api/v1/woo/orders/sync`
- validate payload va batch size
- enqueue vao `orders:stream`
- worker consume stream
- upsert `woo_orders`
- upsert `woo_order_items`
- derive `woo_order_contacts`
- cap nhat `woo_order_sync_state`

Du lieu local da quan sat:

- `190` order trong `woo_orders`
- `189` contact lien ket
- `woo_order_sync_state.status = ok`
- `orders:dead = 0`
- `XPENDING orders:stream = 0`

### 2.2. Tracking purchase

Pipeline analytics da co:

```text
plugin/browser -> POST /api/v1/collect
               -> Redis events:stream
               -> worker
               -> ClickHouse analytics_events
```

Du lieu local da quan sat:

- `2433` events tong
- `203` purchase events
- `203` events co `order_id`

Purchase row dang co:

- `order_id`
- `revenue`
- `currency`
- `event_time`

### 2.3. Khoang trong can xu ly

1. Yeu cau nghiep vu chinh: order moi phat sinh phai duoc day sang Woosaas ngay tai thoi diem tao don; hien tai flow nay chua duoc coi la contract bat buoc trong ke hoach.
2. Purchase tracking dang bam vao `completed`, co nguy co ghi nhan doanh thu tre.
3. Backfill cursor dang duoc luu o WordPress, chua dong bo du vao `woo_order_sync_state`.
4. Chua co smoke test end-to-end chuan cho:
   - order -> PostgreSQL
   - purchase -> ClickHouse
5. Chua co du regression test quanh cac case de gay trung, cap nhat cu hon, refund va retry.

## 3. Nguyen tac thiet ke

1. PostgreSQL la nguon su that cho canonical orders va contacts.
2. ClickHouse la nguon su that cho event analytics.
3. API nhan batch va enqueue nhanh; worker materialize du lieu bat dong bo.
4. Order moi la su kien bat buoc phai push sang Woosaas, khong duoc phu thuoc vao backfill hoac cho den khi status thay doi.
5. Snapshot order phai idempotent theo:
   - `site_id`
   - `woo_order_id`
   - `modified_at_woo`
6. Purchase event va order snapshot la hai luong rieng:
   - snapshot phuc vu order app va contact app
   - purchase event phuc vu analytics
7. Moi task can co output cu the va verification cu the.

## 4. Phase tong quan

1. Phase 0 - Baseline va contract freeze
2. Phase 1 - Day order moi sang Woosaas va materialize vao PostgreSQL
3. Phase 2 - Chuan hoa purchase tracking vao ClickHouse
4. Phase 3 - Hoan thien backfill va sync state server-side
5. Phase 4 - Smoke test, regression test, observability
6. Phase 5 - Dashboard polish va tai lieu van hanh

---

## Phase 0 - Baseline va contract freeze

### Outcome

Chot contract du lieu va diem xuat phat de cac thay doi sau khong vo tinh chen len nhau.

### Task 0.1 - Ghi lai contract API order sync

Pham vi:

- `POST /api/v1/woo/orders/sync`
- request shape `WooOrderSyncRequest`
- response shape `WooOrderSyncResponse`

Noi dung can chot:

- batch limit hien tai: `100`
- required fields:
  - `woo_order_id`
  - `modified_at_woo`
  - `status`
  - `currency`
  - `items`
- headers:
  - `X-Api-Key`
  - `X-Order-Sync-Enabled`
  - `X-Contact-Sync-Enabled`

Output:

- tai lieu contract ngan trong `api.md` hoac phu luc rieng
- danh sach field bat buoc va field optional

Acceptance criteria:

- dev plugin va dev backend doc cung mot contract
- khong con ambiguity ve field nao la required

### Task 0.2 - Ghi lai contract purchase event

Pham vi:

- `/api/v1/collect`
- event `purchase`

Field can chot:

- `event_id`
- `event_time`
- `event_name = purchase`
- `client_id`
- `session_id`
- `order_id`
- `revenue`
- `currency`
- `items_json`
- `attribution`

Acceptance criteria:

- du lieu ClickHouse de query doanh thu khong thieu truong cot loi

### Task 0.3 - Chot cac bang dich va trai nghiem dung

PostgreSQL:

- `woo_orders`
- `woo_order_items`
- `woo_order_contacts`
- `woo_order_sync_state`

ClickHouse:

- `analytics_events`

Acceptance criteria:

- moi Phase sau deu co the map task ve mot bang dich ro rang

---

## Phase 1 - Day order moi sang Woosaas va materialize vao PostgreSQL

### Outcome

Moi order moi tao o WooCommerce phai duoc push sang Woosaas ngay, sau do co snapshot trong PostgreSQL ma khong can cho backfill hoac mot status change ve sau.

### Task 1.1 - Push order moi sang Woosaas ngay khi checkout tao don

Hien trang:

- hook `woocommerce_checkout_order_processed` hien luu:
  - `_woosaas_attribution`
  - `_woosaas_client_id`
  - `_woosaas_session_id`
- chua gui snapshot ngay sau do

Can lam:

- sau khi luu meta va `$order->save()`, goi `Woosaas_Order_Sync::sync_order($order)`
- xem day la diem vao bat buoc cua realtime order sync, khong phai fallback

File du kien:

- `/var/www/site1.local/wp-content/plugins/plugin/includes/class-woocommerce.php`

Rui ro:

- don vua tao co the chua day du truong payment
- tuy nhien backend snapshot co the chap nhan va cap nhat tiep o status change

Acceptance criteria:

- tao order moi tren checkout se gui request sang `/api/v1/woo/orders/sync`
- API tra ve accepted cho order moi hop le
- request se enqueue order snapshot ngay
- PostgreSQL co row moi trong `woo_orders`
- row co `client_id`, `session_id`, `attribution_json` neu cookie co du lieu

### Task 1.2 - Giu sync tren status/refund/trash va dam bao update dung

Hien trang da co:

- `woocommerce_order_status_changed`
- `woocommerce_order_refunded`
- `wp_trash_post`

Can lam:

- verify lai ba hook nay van gui snapshot dung
- bo sung test cho:
  - order processing -> completed
  - refund amount cap nhat
  - deleted_at_woo duoc set khi trash

File du kien:

- plugin test `OrderSyncTest.php`
- backend repo/worker test neu can

Acceptance criteria:

- snapshot moi hon ghi de snapshot cu
- deleted order van con snapshot nhung co `deleted_at_woo`

### Task 1.3 - Khoa idempotency order snapshot

Backend hien co logic:

- neu `modified_at_woo` moi khong lon hon ban da luu thi bo qua payload cu

Can them test cho:

- payload lan 1 modified `T2`
- payload lan 2 modified `T1`
- ket qua DB van giu ban `T2`

File du kien:

- `api/internal/orders/repository_test.go` neu chua co
- hoac integration test o cap service/repository

Acceptance criteria:

- duplicate / stale retry khong lam lui du lieu

### Task 1.4 - Xac nhan contact derivation khong bi hoi quy

Can test:

- cung email -> cung contact
- cung phone khi email rong -> cung contact
- refund/update khong tao contact moi vo ly

File du kien:

- `api/internal/orders/repository_test.go`

Acceptance criteria:

- order/contact aggregation van dung sau update
- `orders_count`, `total_spent`, `first_seen_at`, `last_seen_at` dung

### Task 1.5 - Smoke test runtime order -> PostgreSQL

Can co script local:

1. Lay API key/site id test
2. Gui payload `POST /api/v1/woo/orders/sync`
3. Poll PostgreSQL cho den khi row xuat hien
4. Assert:
   - `woo_orders`
   - `woo_order_items`
   - `woo_order_contacts`
   - `woo_order_sync_state`

File du kien:

- `scripts/smoke-order-sync.sh`

Acceptance criteria:

- script chay doc lap tren docker compose local
- exit code != 0 neu order khong vao DB

---

## Phase 2 - Chuan hoa purchase tracking vao ClickHouse

### Outcome

Doanh thu analytics duoc ghi nhan gan voi thoi diem thanh toan thanh cong, khong phu thuoc muon vao viec order chuyen `completed`.

### Task 2.1 - Chot trigger nghiep vu cho purchase

Van de:

- hien tai plugin track purchase tai `woocommerce_order_status_completed`
- mot so store chi `completed` muon, sau giao hang

De xuat:

- uu tien hook `woocommerce_payment_complete`
- hoac cap nhat policy:
  - `payment_complete` la trigger chinh
  - `completed` chi fallback neu chua tung track purchase

Can quyet dinh ro:

- mot order duoc track purchase toi da bao nhieu lan
- ban ghi purchase o analytics la paid order hay completed order

Acceptance criteria:

- dinh nghia `purchase` duoc chot va ghi vao tai lieu

### Task 2.2 - Them co che chong gui purchase trung o plugin

Khuyen nghi:

- luu order meta nhu `_woosaas_purchase_tracked_at`
- truoc khi track purchase, neu meta da co thi bo qua

Ly do:

- collector dedupe theo `event_id`, khong dedupe theo `order_id`
- hook WordPress co the bi fire lai trong mot so flow

File du kien:

- `/var/www/site1.local/wp-content/plugins/plugin/includes/class-woocommerce.php`
- plugin tests

Acceptance criteria:

- cung mot order khong phat purchase event lan 2 ngoai y muon

### Task 2.3 - Kiem tra payload purchase day du

Can dam bao payload co:

- `order_id`
- `revenue`
- `currency`
- `items_json`
- attribution neu co

Can test:

- plugin schema test
- worker normalize test

File du kien:

- plugin `CollectorSchemaTest.php`
- `api/internal/worker/consumer_test.go`

Acceptance criteria:

- ClickHouse row purchase co cot query duoc ma khong can parse properties fallback

### Task 2.4 - Smoke test purchase -> ClickHouse

Can co script:

1. Gui purchase event qua `/api/v1/collect`
2. Cho worker flush
3. Query ClickHouse theo `order_id`
4. Assert:
   - `event_name = purchase`
   - `revenue`
   - `currency`
   - `site_id`

File du kien:

- `scripts/smoke-purchase-clickhouse.sh`

Acceptance criteria:

- script chay doc lap va fail neu worker khong materialize du lieu

### Task 2.5 - Kiem tra dashboard analytics dung purchase paid event

Can verify:

- overview revenue
- revenue page
- realtime purchase count
- export purchase rows

Khong nhat thiet sua frontend neu backend contract khong doi, nhung can test lai sau khi doi trigger.

Acceptance criteria:

- so lieu analytics thay doi phu hop khi purchase duoc ghi som hon

---

## Phase 3 - Hoan thien backfill va sync state server-side

### Outcome

Backfill co trang thai tin cay tu backend, dashboard doc duoc, khong phai suy doan tu WordPress options.

### Task 3.1 - Chot ownership cua backfill progress

Quyet dinh:

- plugin dieu phoi batch
- backend la noi luu sync state de dashboard doc

Ly do:

- dashboard dang doc `/sites/:site_id/orders/sync-state`
- bang `woo_order_sync_state` da co schema phuc vu viec nay

Acceptance criteria:

- ro rang ai la source of truth cho status hien thi dashboard

### Task 3.2 - Tao endpoint cap nhat backfill state

De xuat endpoint:

```http
POST /api/v1/woo/orders/backfill-state
X-Api-Key: ...
```

Payload de xuat:

```json
{
  "status": "running",
  "last_backfill_modified_at": "2026-05-12T10:00:00Z",
  "last_backfill_order_id": "12345",
  "backfill_completed_at": null
}
```

Hoac:

- tach endpoint `start`, `progress`, `complete`

Toi uu uu tien:

- mot endpoint cap nhat state don gian de giam bloat

File du kien:

- `api/internal/api/router.go`
- `api/internal/api/handlers/orders.go`
- `api/internal/orders/service.go`
- `api/internal/orders/repository.go`
- `api/pkg/models/orders.go`

Acceptance criteria:

- backend co the luu progress backfill that

### Task 3.3 - Plugin gui progress sau moi batch

Hien trang:

- plugin dang luu:
  - `woosaas_last_backfill_modified_at`
  - `woosaas_last_backfill_order_id`
  - `woosaas_last_backfill_status`

Can lam:

- sau moi batch thanh cong, plugin gui progress ve backend
- khi complete, gui status `done`
- khi reset, gui status `idle`

File du kien:

- `/var/www/site1.local/wp-content/plugins/plugin/includes/admin/class-admin.php`

Acceptance criteria:

- WordPress option va backend state khong bi lech nghiem trong
- dashboard thay tien do backfill dang chay

### Task 3.4 - Cap nhat backend state khi worker thanh cong/that bai

Hien trang:

- worker da `MarkSyncError`
- repository da `markSyncSuccess`

Can lam:

- verify state khong bi backfill ghi de vo ly realtime state
- neu can, tach field:
  - realtime status
  - backfill status

Neu chua tach schema, can toi thieu quy dinh:

- `status` uu tien error neu worker loi
- backfill progress van giu cursor rieng

Acceptance criteria:

- sync-state endpoint tra ve trang thai co y nghia van hanh

### Task 3.5 - Test endpoint sync state

Can them test:

- update progress
- complete progress
- reset progress
- read sync state bang dashboard route

Acceptance criteria:

- `/sites/:site_id/orders/sync-state` tra du field can cho UI

---

## Phase 4 - Smoke test, regression test, observability

### Outcome

Co bo test van hanh thuc te va bo regression test giu cho pipeline khong vo tinh hong.

### Task 4.1 - Bo smoke script tong hop

De xuat script tong:

- `scripts/smoke-orders-and-purchase.sh`

Noi dung:

1. Check API health
2. Gui order snapshot
3. Gui purchase event
4. Doi worker
5. Query PostgreSQL
6. Query ClickHouse
7. In ra summary ngan

Acceptance criteria:

- chay mot lenh la biet pipeline co song hay khong

### Task 4.2 - Integration test cho order pipeline

Can phu:

- queue -> worker -> repository
- stale update
- retry/dead letter neu DB loi gia lap duoc

Acceptance criteria:

- loi regression o stream/order consumer bi bat som

### Task 4.3 - Integration test cho analytics purchase pipeline

Can phu:

- event payload -> worker insert ClickHouse
- normalize fallback tu properties
- purchase co `order_id`, `revenue`, `currency`

Acceptance criteria:

- analytics materialization khong mat field thuong dung

### Task 4.4 - Theo doi dead-letter va pending stream

Can checklist runtime:

- `XLEN events:dead`
- `XLEN orders:dead`
- `XPENDING events:stream`
- `XPENDING orders:stream`

Neu muon nang cap:

- them health/debug endpoint rieng
- hoac in vao scripts smoke

Acceptance criteria:

- co cach phat hien nhanh queue bi tac hoac worker loi

---

## Phase 5 - Dashboard polish va tai lieu van hanh

### Outcome

Nguoi van hanh doc dashboard la biet store dang sync toi dau va analytics co du lieu moi hay khong.

### Task 5.1 - Hien thi sync-state day du hon

UI du kien:

- current realtime sync status
- last success
- last error
- backfill cursor
- backfill completed at

Pham vi:

- orders/contact onboarding hoac site detail page

Acceptance criteria:

- khong can mo DB de biet sync dang chay hay bi loi

### Task 5.2 - Ghi tai lieu van hanh local

Can bo sung:

- cach verify order sync
- cach verify purchase analytics
- cach doc Redis dead letter
- cach check PostgreSQL va ClickHouse nhanh

File du kien:

- `README.md`
- `CONTEXT.md`
- hoac `docs/order-sync-runbook.md`

Acceptance criteria:

- dev moi clone repo co the tu test pipeline trong vai phut

---

## 5. Thu tu uu tien thuc thi

### P0 - Nen lam truoc

1. Task 1.1 - Push order moi sang Woosaas ngay khi checkout tao don
2. Task 1.3 - Test idempotency snapshot
3. Task 2.1 - Chot trigger purchase
4. Task 2.2 - Chong gui purchase trung
5. Task 2.4 - Smoke test purchase -> ClickHouse
6. Task 1.5 - Smoke test order -> PostgreSQL

### P1 - Sau khi P0 on dinh

1. Task 3.2 - Endpoint cap nhat backfill state
2. Task 3.3 - Plugin gui progress ve backend
3. Task 3.5 - Test sync-state
4. Task 4.1 - Smoke script tong hop

### P2 - Hoan thien va polish

1. Task 4.2 - Integration test day du order pipeline
2. Task 4.3 - Integration test analytics pipeline
3. Task 5.1 - Dashboard sync-state polish
4. Task 5.2 - Runbook / docs

---

## 6. Acceptance criteria tong

### Order sync

- Tao order moi tren `site1.local`
- Plugin gui snapshot sang Woosaas ngay sau khi order duoc tao
- API nhan request `/api/v1/woo/orders/sync` va accepted order hop le
- Trong thoi gian ngan:
  - co row trong `woo_orders`
  - co items trong `woo_order_items`
  - co contact khi contact sync bat
- Refund va status change cap nhat snapshot dung
- Payload cu hon khong ghi de payload moi hon

### Purchase analytics

- Payment thanh cong tao ra purchase event dung nghiep vu da chot
- ClickHouse co:
  - `event_name = purchase`
  - `order_id`
  - `revenue`
  - `currency`
- Dashboard analytics phan anh du lieu moi

### Backfill

- Start/reset/progress/complete duoc luu server-side
- Dashboard doc duoc cursor va status that

### Van hanh

- Smoke scripts chay duoc tren local docker compose
- Redis pending/dead queue khong bat thuong
- `go test ./...` pass
- plugin tests lien quan pass

---

## 7. Danh sach file du kien cham toi

### Plugin ngoai repo

- `/var/www/site1.local/wp-content/plugins/plugin/includes/class-woocommerce.php`
- `/var/www/site1.local/wp-content/plugins/plugin/includes/class-order-sync.php`
- `/var/www/site1.local/wp-content/plugins/plugin/includes/class-collector.php`
- `/var/www/site1.local/wp-content/plugins/plugin/includes/admin/class-admin.php`
- `/var/www/site1.local/wp-content/plugins/plugin/tests/unit/OrderSyncTest.php`
- `/var/www/site1.local/wp-content/plugins/plugin/tests/unit/CollectorSchemaTest.php`

### Backend trong repo

- `api/internal/api/router.go`
- `api/internal/api/handlers/orders.go`
- `api/internal/orders/service.go`
- `api/internal/orders/repository.go`
- `api/internal/worker/consumer.go`
- `api/pkg/models/orders.go`
- cac file test tuong ung

### Scripts/docs

- `scripts/smoke-order-sync.sh`
- `scripts/smoke-purchase-clickhouse.sh`
- `scripts/smoke-orders-and-purchase.sh`
- `README.md`
- `CONTEXT.md`
- `api.md`

---

## 8. Definition of Done

Mot phase chi duoc xem la done khi:

1. Code da merge vao dung layer.
2. Unit test lien quan pass.
3. Smoke test local pass.
4. Du lieu DB dich duoc xac nhan bang query that.
5. Tai lieu contract hoac runbook lien quan da cap nhat.
