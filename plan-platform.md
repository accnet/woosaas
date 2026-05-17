# Plan: Tenant App + Platform Admin + Billing Enforcement

## Nguyên tắc kiến trúc

### 1. Tenant app

- Tenant/account được gọi là `users`.
- Người đăng nhập trong tenant app được gọi là `users_members`.
- `users_members` luôn gắn với `user_id` của bảng `users`.
- Quyền trong tenant app chỉ gồm quyền nội bộ account: `owner`, `admin`, `member`, `billing`, `viewer`.
- Không có quyền `platform admin` trong tenant app.
- Không thêm `is_admin` vào tenant `users` hoặc `users_members`.

### 2. Platform Admin riêng

- App/domain riêng, ví dụ: `admin.yoursaas.com`.
- Login riêng cho nhân sự nội bộ.
- Platform admin không thuộc `users` nào.
- Platform admin quản lý toàn hệ thống: `users`, `plans`, billing, incidents, impersonation, audit, feature flags, tracking API providers.
- Platform admin dùng auth/session riêng, middleware riêng, UI riêng.

### 3. Tracking API

- Giữ nguyên thiết kế per-site.
- `api_keys` vẫn gắn theo site để revoke, audit và quota rõ ràng.
- Plan limit semantics:
  - `site_limit`: giới hạn số site active hiện tại, không reset theo tháng.
  - `event_limit`: quota event ingest theo tháng, reset đầu mỗi tháng/kỳ billing.
  - `tracking_order_limit`: quota Order Tracking API theo tháng, reset đầu mỗi tháng/kỳ billing.
- `collect_url` vẫn system-wide qua `API_BASE_URL`.

---

## Trạng thái hiện tại

### Đã có

- `billing/service.go`: đã có định nghĩa plans `free/starter/pro` với `event_limit`, `site_limit`, nhưng chưa enforce.
- Auth/JWT/profile hiện tại đang xoay quanh `users`; bảng `users` hiện đang chứa `email`, `password_hash`, `name` của người đăng nhập.
- Seed account hiện tại là tenant user, không phải platform admin. Fresh DB dùng `john@woosaas.com`; nếu DB cũ còn `admin@woosaas.com` thì migration phải rename sang `john@woosaas.com`.
- `site_members`: team với roles `owner/admin/editor/viewer` và permission matrix; sẽ deprecate dần để quyền tenant dùng `users_members.role` account-level.
- `tracker.js`: per-site với `site_id`, `api_key`, `collect_url`.
- `api_keys`: per-site, encrypted, hash-stored.

### Cần chỉnh theo model mới

1. Tách rõ `users` là account/tenant, không phải platform admin.
2. Thêm `users_members` để đại diện người đăng nhập thuộc account.
3. Chuyển quyền tenant app về `users_members.role`.
4. Tạo platform admin identity riêng, không dùng `is_admin`.
5. Billing/subscription/quota gắn với `users.id`.
6. Site ownership gắn với `users.id`.
7. Admin audit cần lưu DB, không chỉ structured log.
8. Soft delete sites để giữ analytics history.
9. Enforce plan limits và feature gating.

---

## Kiến trúc tổng thể

```text
Tenant App
  users                         account/tenant/customer
    ├── users_members            login users thuộc account
    │    └── role: owner/admin/member/billing/viewer
    ├── subscriptions            billing plan của account
    ├── sites                    workspaces/properties
    │    ├── api_keys            per-site tracking keys
    │    └── site_members        legacy/deprecated sau khi chuyển sang account-level roles
    └── quota enforcement        site limit + event limit + feature gating

Platform Admin App
  platform_admin_users           internal staff only, không thuộc users
    ├── platform_admin_sessions
    ├── platform_admin_audit_logs
    └── quản lý users/plans/billing/incidents/impersonation/feature flags/tracking providers
```

Ghi chú naming:

- `users` = tenant/account trong business domain.
- `users_members` = human login/member thuộc một `users` account.
- Trong code nên tránh biến mơ hồ như `userID` nếu đang nói về account. Ưu tiên `accountID` ở service layer, nhưng DB column vẫn là `user_id` nếu theo naming đã chọn.

---

## Phần 1: Data Model Foundations

### A1 — Chuẩn hóa `users` thành account/tenant

- **Migration**: `api/migrations_postgres/016_users_account_model.sql`

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL;

UPDATE users
SET email = 'john@woosaas.com',
    name = COALESCE(NULLIF(name, 'Admin'), 'John'),
    updated_at = NOW()
WHERE email = 'admin@woosaas.com';
```

- Không thêm `is_admin`.
- `users.status`: `active`, `disabled`, `suspended`, `deleted`.
- `john@woosaas.com` là tenant owner seed/account hiện tại, không phải platform admin.
- Vì bảng `users` hiện đang chứa login credentials, migration phải làm theo hướng additive:
  1. Giữ `users.email`, `users.password_hash`, `users.name` trong phase đầu để rollback an toàn.
  2. Backfill credentials sang `users_members`.
  3. Chuyển auth/profile sang `users_members`.
  4. Sau khi code ổn định mới đánh dấu các cột credentials trên `users` là legacy hoặc tạo migration cleanup riêng.
- Mỗi row `users` hiện tại trở thành một account/tenant riêng. Không merge account trong migration này.
- `users.name` có thể tiếp tục dùng làm account name trong phase đầu; `users_members.full_name` lấy từ `users.name` khi backfill owner đầu tiên.

### A2 — Thêm `users_members`

- **Migration**: `api/migrations_postgres/017_users_members.sql`

```sql
CREATE TABLE IF NOT EXISTS users_members (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   TEXT,
    full_name       VARCHAR(255),
    role            VARCHAR(30) NOT NULL DEFAULT 'member',
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    last_login_at   TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (role IN ('owner', 'admin', 'member', 'billing', 'viewer')),
    CHECK (status IN ('active', 'disabled', 'invited'))
);

CREATE INDEX IF NOT EXISTS idx_users_members_user_id ON users_members(user_id);
CREATE INDEX IF NOT EXISTS idx_users_members_email_lower ON users_members(LOWER(email));
```

- Email tenant login là **global unique**: `users_members.email` có `UNIQUE(email)`.
- Nếu muốn tránh case-variant duplicate như `A@x.com` và `a@x.com`, dùng thêm unique index trên `LOWER(email)` sau khi backfill sạch dữ liệu.
- Nếu sau này muốn một email tham gia nhiều account, phải thêm account switcher/account slug vào login flow trước khi bỏ unique global.
- Trước khi chạy migration/backfill cần kiểm tra duplicate email trong `users`. Không áp dụng `UNIQUE(email)` nếu query này còn trả rows:

```sql
SELECT LOWER(email), COUNT(*)
FROM users
GROUP BY LOWER(email)
HAVING COUNT(*) > 1;
```

- Sau khi backfill sạch duplicate, thêm case-insensitive unique index nếu cần:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_members_email_unique ON users_members(LOWER(email));
```

- Backfill từ `users` hiện tại:

```sql
INSERT INTO users_members (user_id, email, password_hash, full_name, role, status, created_at, updated_at)
SELECT id, email, password_hash, name, 'owner', 'active', created_at, updated_at
FROM users
WHERE deleted_at IS NULL
ON CONFLICT DO NOTHING;
```

- Với DB đã có seed cũ, owner member sau backfill phải là `john@woosaas.com`, không phải `admin@woosaas.com`.

- Register flow tạo:
  1. Một row trong `users`.
  2. Một row owner trong `users_members`.
  3. Một subscription `free` cho `users.id`.

### A2.1 — Deprecate `site_members`

- Không migrate `site_members` sang `member_id` trong plan này.
- Tenant authorization chuyển về `users_members.role` ở account-level:
  - `owner`, `admin`: quản lý sites, integrations, team, analytics theo role policy.
  - `member`: vận hành thông thường trên toàn account.
  - `billing`: billing/invoices/plan.
  - `viewer`: read-only toàn account.
- `site_members` giữ tạm để không phá dữ liệu cũ, nhưng không dùng làm nguồn quyền chính sau khi auth chuyển sang `users_members`.
- Trong migration window:
  - `CreateSite` không cần tạo thêm `site_members owner` cho site mới.
  - Team/member UI đọc/ghi `users_members`, không đọc/ghi `site_members`.
  - Các permission checks chuyển từ site-level role sang account-level `users_members.role`.
  - Query legacy có join `site_members` chỉ giữ để tương thích đọc nếu cần, không dùng để cấp thêm quyền mới.
- Sau khi code đã bỏ dependency, tạo cleanup migration:

```sql
DROP TABLE IF EXISTS site_members;
```

### A3 — Soft delete sites

- **Migration**: thêm `deleted_at` vào `sites`.

```sql
ALTER TABLE sites ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS idx_sites_deleted_at ON sites(deleted_at) WHERE deleted_at IS NOT NULL;
```

- `DeleteSite` đổi thành `UPDATE sites SET deleted_at = NOW() WHERE id = $1 AND user_id = $2`.
- Mọi query list/get site phải thêm `deleted_at IS NULL`.
- Audit bắt buộc các query sau:
  - `GetSiteByID`, `GetSitesByUserID`, `ValidateAPIKey`, `GetSiteByAPIKey`.
  - Account-level permission checks và team/member queries.
  - Order/contact/sync-state queries theo `site_id`.
  - ShopBase/WooCommerce sync entrypoints.
  - Redis caches `api_key:*` và `site_owner:*` phải invalidate hoặc revalidate DB nếu site bị soft-delete.

### A4 — Platform admin tables

- **Migration**: `api/migrations_postgres/018_platform_admin.sql`

```sql
CREATE TABLE IF NOT EXISTS platform_admin_users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    full_name       VARCHAR(255),
    role            VARCHAR(30) NOT NULL DEFAULT 'admin',
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    last_login_at   TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (role IN ('owner', 'admin', 'support', 'billing', 'viewer')),
    CHECK (status IN ('active', 'disabled'))
);

CREATE TABLE IF NOT EXISTS platform_admin_sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id        UUID NOT NULL REFERENCES platform_admin_users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(64) NOT NULL UNIQUE,
    ip_address      INET,
    user_agent      TEXT,
    expires_at      TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at      TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_admin_impersonation_sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id        UUID NOT NULL REFERENCES platform_admin_users(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason          TEXT NOT NULL,
    started_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at        TIMESTAMP WITH TIME ZONE,
    metadata        JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS platform_admin_audit_logs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id            UUID REFERENCES platform_admin_users(id) ON DELETE SET NULL,
    action              VARCHAR(100) NOT NULL,
    target_type         VARCHAR(100) NOT NULL,
    target_id           UUID,
    reason              TEXT,
    metadata            JSONB NOT NULL DEFAULT '{}',
    ip_address          INET,
    user_agent          TEXT,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_admin_sessions_admin_id ON platform_admin_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_platform_admin_sessions_expires_at ON platform_admin_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_platform_admin_impersonation_admin_id ON platform_admin_impersonation_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_platform_admin_impersonation_user_id ON platform_admin_impersonation_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_admin_audit_logs_admin_id ON platform_admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_platform_admin_audit_logs_target ON platform_admin_audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_platform_admin_audit_logs_created_at ON platform_admin_audit_logs(created_at);
```

- Audit phải lưu DB cho các action: change plan, disable account, enable account, impersonation start/end, update plan, update feature flag, incident action.
- First admin bootstrap phải là command/seed riêng, không dùng tenant register. Ví dụ `api/cmd/platform-admin-bootstrap`.
- Các action nhạy cảm bắt buộc có `reason`: disable account, change plan, impersonation, disable tracking provider.

### A5 — Plans stored in DB

- **Migration**: `api/migrations_postgres/019_plans.sql`

```sql
CREATE TABLE IF NOT EXISTS plans (
    id           VARCHAR(50) PRIMARY KEY,
    name         VARCHAR(100) NOT NULL,
    description  TEXT,
    price_cents  INTEGER NOT NULL DEFAULT 0,
    interval     VARCHAR(20) NOT NULL DEFAULT 'monthly',
    event_limit  BIGINT NOT NULL DEFAULT 10000,
    site_limit   INTEGER NOT NULL DEFAULT 1,
    tracking_order_limit BIGINT NOT NULL DEFAULT 0,
    features     JSONB NOT NULL DEFAULT '[]',
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (tracking_order_limit >= -1),
    CHECK (jsonb_typeof(features) = 'array')
);
```

- Seed `free`, `starter`, `pro` từ `billing/service.go`.
- `site_limit` là giới hạn số site active tại một thời điểm; xóa mềm site sẽ giải phóng quota này.
- `event_limit` là số event được ingest mỗi tháng/kỳ billing; quota reset khi sang period mới.
- `tracking_order_limit` là số order/tracking records được xử lý qua Order Tracking API mỗi tháng/kỳ billing. `0` nghĩa là không bật trong plan đó; `-1` nếu cần unlimited.
- `BillingService` đọc plans từ DB, không hardcode slice.

### A6 — System tracking provider configuration

- **Migration**: `api/migrations_postgres/021_tracking_providers.sql`
- Bảng này là cấu hình hệ thống do Platform Admin quản lý, khác với `shipment_tracking_provider_settings` là credentials riêng của từng `users` account trong `tracking.md`.

```sql
CREATE TABLE IF NOT EXISTS tracking_providers (
    id                  VARCHAR(50) PRIMARY KEY,
    display_name        VARCHAR(100) NOT NULL,
    enabled             BOOLEAN NOT NULL DEFAULT true,
    base_url            TEXT,
    docs_url            TEXT,
    auth_type           VARCHAR(50) NOT NULL DEFAULT 'api_key',
    supports_webhooks   BOOLEAN NOT NULL DEFAULT false,
    supports_refresh    BOOLEAN NOT NULL DEFAULT true,
    supports_register   BOOLEAN NOT NULL DEFAULT true,
    capabilities        JSONB NOT NULL DEFAULT '{}',
    config_schema       JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

- Seed providers:

| Provider ID | Display name | Default enabled | Notes |
|---|---|---:|---|
| `17track` | 17TRACK | true | API key/token, register + refresh + webhook nếu account provider hỗ trợ |
| `aftership` | AfterShip | true | `as-api-key`, base URL theo version đang dùng |
| `trackingmore` | TrackingMore | true | API key/token, register + refresh |

- `config_schema` mô tả field tenant cần nhập, ví dụ `api_key`, `webhook_secret`, `account_region`.
- Platform Admin có thể disable provider ở system-level. Khi disabled:
  - Tenant không chọn provider đó làm active provider được.
  - Existing active provider tiếp tục hiển thị trạng thái `disabled_by_platform`.
  - Background refresh/webhook xử lý theo policy: chặn outbound calls mới, vẫn nhận webhook nếu cần để không mất cập nhật.

---

## Phần 2: Tenant Auth + Authorization

### B1 — Tenant login bằng `users_members`

- Login phase đầu dùng email global unique trong `users_members`.
- Nếu email/password hợp lệ nhưng account hoặc member disabled thì trả 401 chung, không expose trạng thái account.
- JWT tenant app chứa:
  - `member_id`: `users_members.id`
  - `user_id`: `users.id` account id
  - `role`: role trong account
  - `token_type`: `tenant`
- JWT `sub` nên là `member_id`; `user_id` giữ vai trò account/customer boundary.
- `RequireAuth` validate JWT rồi kiểm tra:
  0. `token_type = 'tenant'`
  1. `users.status = 'active'`
  2. `users_members.status = 'active'`
  3. membership thuộc đúng `user_id`
- Cache status Redis:
  - `user_status:{userID}`
  - `member_status:{memberID}`
  - TTL 5 phút.
- Khi disable account/member thì invalidate các cache key liên quan.
- Trong migration window, token cũ chỉ có `user_id/email` nên nên force logout hoặc tăng JWT issuer/version để tránh ambiguous identity.
- Gin context nên set rõ:
  - `user_id` = account id để tương thích handler cũ.
  - `account_id` = account id cho code mới.
  - `member_id` = users_members id.
  - `member_role` = role trong account.

### B2 — Tenant roles

Role trong tenant app:

| Role | Quyền chính |
|---|---|
| `owner` | Full access, billing, members, delete account |
| `admin` | Quản lý sites, members, integrations, analytics |
| `member` | Vận hành thông thường |
| `billing` | Billing, invoices, plan |
| `viewer` | Read-only |

- Không dùng `platform admin` trong tenant role list.
- `users_members.role` là nguồn quyền chính cho tenant app.
- Không thêm site-level role mới trong phase này.
- `site_members` là legacy và sẽ bị loại bỏ dần; không dùng `site_members.user_id` để cấp quyền sau khi auth chuyển sang `users_members`.
- Nếu sau này cần granular site access, thiết kế lại bảng mới trên `users_members.id` thay vì tái dùng `site_members.user_id`.

### B3 — Frontend tenant app

- `dashboard/src/lib/types.ts`:
  - User/account type: `id`, `name`, `status`, plan summary.
  - Member type: `id`, `user_id`, `email`, `full_name`, `role`, `status`.
- Auth store expose:
  - `currentUser` hoặc `account`.
  - `currentMember`.
  - `role`.
- Không expose `isAdmin` cho platform admin.

---

## Phần 3: Platform Admin

### C1 — Platform admin auth

- File/module riêng, ví dụ:
  - `api/internal/platform_admin/auth`
  - `api/internal/platform_admin/handlers`
  - `api/internal/platform_admin/middleware`
- Login endpoint riêng:

```text
POST /api/admin/v1/auth/login
POST /api/admin/v1/auth/logout
GET  /api/admin/v1/me
```

- Middleware riêng kiểm tra `platform_admin_users`.
- Không dùng tenant `RequireAuth`.
- Platform admin token/session phải có `token_type = 'platform_admin'`.
- Tenant middleware phải reject platform admin token; platform admin middleware phải reject tenant token.
- Logout revoke `platform_admin_sessions.revoked_at`.
- Bootstrap first admin bằng CLI/seed có kiểm soát, không public endpoint.

### C2 — Platform admin endpoints

```text
GET  /api/admin/v1/users?page=1&per_page=20&search=&plan=&status=
GET  /api/admin/v1/users/:user_id
PUT  /api/admin/v1/users/:user_id/status
PUT  /api/admin/v1/users/:user_id/plan
GET  /api/admin/v1/users/:user_id/members
PUT  /api/admin/v1/users/:user_id/members/:member_id/status

GET  /api/admin/v1/plans
PUT  /api/admin/v1/plans/:plan_id

GET  /api/admin/v1/stats
GET  /api/admin/v1/audit-logs

GET  /api/admin/v1/tracking-providers
GET  /api/admin/v1/tracking-providers/:provider_id
PUT  /api/admin/v1/tracking-providers/:provider_id

POST /api/admin/v1/impersonation
DELETE /api/admin/v1/impersonation/:session_id
```

Response list:

```json
{ "users": [], "total": 150, "page": 1, "per_page": 20 }
```

- Các write endpoints nhạy cảm nhận body có `reason`:
  - change account status
  - change plan
  - member disable/enable
  - impersonation start
  - tracking provider disable/update
- Impersonation token phải là tenant-scoped token có marker `impersonated_by_admin_id` và thời hạn ngắn; UI tenant phải hiển thị trạng thái impersonation cho internal staff.

### C3 — Platform admin frontend

- App/domain riêng, ví dụ:
  - `admin.yoursaas.com`
  - hoặc package route riêng nếu monorepo vẫn dùng cùng Next app, nhưng auth boundary phải tách.
- Không đặt dưới tenant dashboard như `/dashboard/admin`.
- Pages:
  - `/login`
  - `/users`
  - `/users/[userId]`
  - `/plans`
  - `/billing`
  - `/incidents`
  - `/audit`
  - `/feature-flags`
  - `/tracking-providers`

---

## Phần 4: Billing Enforcement

### D1 — Subscriptions table

- **Migration**: `api/migrations_postgres/020_subscriptions.sql`

```sql
CREATE TABLE IF NOT EXISTS subscriptions (
    id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    plan_id                VARCHAR(50) NOT NULL DEFAULT 'free' REFERENCES plans(id),
    status                 VARCHAR(20) NOT NULL DEFAULT 'active',
    current_period_start   TIMESTAMP WITH TIME ZONE,
    current_period_end     TIMESTAMP WITH TIME ZONE,
    stripe_customer_id     VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    created_at             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at             TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

- `user_id` ở đây là account id từ bảng `users`.
- Auto-create `free` subscription khi register.
- Backfill:

```sql
INSERT INTO subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
SELECT id, 'free', 'active', NOW(), NOW() + INTERVAL '1 month'
FROM users
WHERE deleted_at IS NULL
  AND id NOT IN (SELECT user_id FROM subscriptions);
```

### D2 — BillingService

- **File**: `api/internal/billing/service.go`
- Inject `*pgxpool.Pool` và Redis.
- Methods:
  - `GetSubscription(ctx, userID) (*Subscription, error)`
  - `GetPlanForUser(ctx, userID) (*Plan, error)`
  - `UpdateUserPlan(ctx, userID, planID string) error`
  - `EnsureFreeSubscription(ctx, userID) error`
  - `GetAllPlans(ctx) ([]Plan, error)`
  - `UpdatePlan(ctx, planID string, updates PlanUpdate) error`
  - `CheckSubscriptionAccess(ctx, userID) error`

### D3 — Subscription expiry + grace period

- Nếu `subscription.status = 'active'` thì OK.
- Nếu `cancelled` hoặc `past_due`:
  - Trong `current_period_end + 7 days`: cho dashboard read-only, chặn create site và event ingest nếu business muốn enforce chặt.
  - Hết grace period: trả `ErrSubscriptionExpired`, handler map thành 402.
- Worker chạy hàng ngày:
  - `past_due` quá 7 ngày thì downgrade về `free` hoặc suspend ingest tùy policy.

### D4 — Site limit

- **File**: `api/internal/sites/service.go`
- `site_limit` là limit trạng thái hiện tại, không phải quota tháng.
- Trước khi tạo site:
  1. Lấy plan của `users.id`.
  2. Count site active: `SELECT COUNT(*) FROM sites WHERE user_id = $1 AND deleted_at IS NULL`.
  3. Nếu count >= `site_limit`: trả `ErrSiteLimitExceeded`, handler map 402.
- Khi site bị soft-delete, site đó không còn tính vào `site_limit`.

### D5 — Event limit

- **File**: `api/internal/api/handlers/collect.go`
- `event_limit` là monthly quota theo account, reset theo tháng/kỳ billing; không phải lifetime usage.
- Redis monthly counter theo account:
  - Key: `quota:events:{userID}:{YYYY-MM}`
  - TTL đến đầu tháng sau.
  - Dùng Lua script hoặc transaction để atomic check/increment.
  - Nếu dùng `INCR` trước rồi phát hiện vượt limit, cần `DECR` lại hoặc chấp nhận over-count có chủ đích và ghi rõ trong usage semantics.
- Site to account cache:
  - Key: `site_owner:{siteID}`
  - Value: `users.id`
  - TTL 1 giờ.
  - Cache miss query: `SELECT user_id FROM sites WHERE id = $1 AND deleted_at IS NULL`.
- Collect path phải kiểm tra `users.status`, `subscription.status/current_period_end`, và site chưa soft-delete trước khi nhận event.
- Nếu Redis lỗi: fail open cho quota counter, nhưng không fail open cho API key/site/account validity.

### D6 — Order Tracking API limit

- `tracking_order_limit` là monthly quota theo account, reset theo tháng/kỳ billing; không phải lifetime usage.
- Áp dụng cho shipment/order tracking endpoints trong `tracking.md`:
  - Add tracking.
  - Register tracking với provider.
  - Manual refresh.
  - Provider webhook update nếu tạo usage billable theo policy.
- Redis monthly counter theo account:
  - Key: `quota:tracking_orders:{userID}:{YYYY-MM}`
  - TTL đến đầu tháng sau.
  - INCR khi tạo tracking mới hoặc khi gọi API tracking billable.
  - Nếu vượt `tracking_order_limit`: trả 402 hoặc 429 với `"Order tracking quota exceeded"`.
- Nếu `tracking_order_limit = 0` và plan không có feature `order_tracking_api`: trả 402 `"Order Tracking API not available on your plan"`.
- Nếu `tracking_order_limit = -1`: bỏ qua quota count, chỉ kiểm tra subscription active.
- Trước khi gọi provider, service phải kiểm tra `tracking_providers.enabled = true` cho provider tenant đang chọn.
- Usage endpoint cho billing page nên trả:

```json
{
  "tracking_orders": {
    "used": 1200,
    "limit": 5000,
    "period": "2026-05"
  }
}
```

### D7 — Feature gating

- **File mới**: `api/internal/api/middleware/feature.go`
- `RequireFeature(feature string)` dùng `user_id` từ tenant JWT để lấy plan.
- Nếu thiếu feature: trả 402 `"Feature not available on your plan"`.

Feature mapping:

| Feature | Quyền |
|---|---|
| `basic_analytics` | stats/overview, stats/trend, stats/sources |
| `all_analytics` | Tất cả stats endpoints |
| `email_support` | Helpdesk |
| `priority_support` | Helpdesk + priority flag |
| `api_access` | WooCommerce sync API, Export API |
| `realtime` | Real-time online users |
| `order_tracking_api` | Add tracking, provider registration, refresh, webhook sync |

Seed features:

- Free: `["basic_analytics"]`
- Starter: `["basic_analytics", "all_analytics", "email_support", "order_tracking_api"]`
- Pro: `["basic_analytics", "all_analytics", "email_support", "priority_support", "api_access", "realtime", "order_tracking_api"]`
- Business: `["basic_analytics", "all_analytics", "email_support", "priority_support", "api_access", "realtime", "order_tracking_api"]`

Suggested plan limits:

| Plan | `site_limit` active | `event_limit` / month | `tracking_order_limit` / month | Order Tracking API |
|---|---:|---:|---:|---|
| `free` | 1 | 10,000 | 0 | Không bật |
| `starter` | 3 | 100,000 | 5,000 | Bật |
| `pro` | 10 | 1,000,000 | 50,000 | Bật |
| `business` | 50 | 5,000,000 | 250,000 | Bật |

---

## Phần 5: System Tracking Provider Settings

### E1 — Provider registry service

- **File mới**: `api/internal/tracking_providers/service.go`
- Responsibilities:
  - `ListProviders(ctx, includeDisabled bool)`
  - `GetProvider(ctx, providerID string)`
  - `UpdateProvider(ctx, providerID string, updates ProviderUpdate)`
  - `IsProviderEnabled(ctx, providerID string) bool`
- `shipment_tracking` service phải đọc registry này trước khi:
  - Cho tenant chọn active provider.
  - Register tracking với provider.
  - Manual refresh.
  - Gửi outbound API request đến 17TRACK/AfterShip/TrackingMore.

### E2 — Tenant settings filtered by system config

- Endpoint tenant `GET /api/v1/settings/shipment-tracking/providers` chỉ trả providers đang có trong `tracking_providers`.
- Nếu provider disabled ở system-level:
  - Response vẫn có thể trả provider đó nếu tenant đã từng cấu hình, nhưng phải có `platform_enabled: false`.
  - UI disable toggle/set-active button.
  - Không expose raw secrets.
- Policy khi provider disabled:
  - Chặn tenant set active provider mới.
  - Chặn add tracking/register/refresh outbound mới qua provider đó.
  - Webhook inbound vẫn có thể nhận và validate để cập nhật tracking hiện có nếu business muốn không mất trạng thái; không tạo usage billable mới khi disabled.
  - Existing active provider hiển thị `disabled_by_platform`.

Example response item:

```json
{
  "provider": "17track",
  "display_name": "17TRACK",
  "platform_enabled": true,
  "enabled": true,
  "api_key_configured": true,
  "webhook_secret_configured": false,
  "supports_webhooks": true,
  "supports_refresh": true
}
```

### E3 — Platform Admin provider UI

- Page: `/tracking-providers`.
- Table columns:
  - Provider name.
  - Enabled.
  - Base URL.
  - Capabilities.
  - Tenant accounts using provider.
  - Error rate / last error if available.
- Edit actions:
  - Enable/disable provider.
  - Update base URL/docs URL.
  - Update capability flags.
  - Update config schema.
- Mọi thay đổi ghi `platform_admin_audit_logs` với action `update_tracking_provider`.

---

## Phần 6: Tenant Billing UI

- **File**: `dashboard/src/app/dashboard/billing/page.tsx`
- Hiển thị:
  - Plan hiện tại.
  - Sites: X / Y.
  - Events this month: X / Y.
  - Order tracking API usage: X / Y tracking orders this month.
  - Billing status.
  - Nút upgrade/manage billing.
- Chỉ role `owner` và `billing` được thay đổi plan hoặc mở billing portal.

---

## Phần 7: Tracking API — Giữ nguyên per-site

| | Thiết kế hiện tại | Global key |
|---|---|---|
| Isolation | Mỗi site độc lập | Dễ lẫn dữ liệu |
| Revoke | Revoke 1 site key | Ảnh hưởng toàn account |
| Audit | Biết event đến từ site nào | Phải suy ra qua field khác |
| Quota | Có thể map site -> users.id | Thiếu boundary tự nhiên |

Kết luận: không đổi sang global key.

---

## Thứ tự thực hiện

```text
Phase 1 — Database foundations
  A1  016_users_account_model.sql
  A2  017_users_members.sql
  A2.1 deprecate site_members, move permission source to users_members.role
  A4  018_platform_admin.sql
  A5  019_plans.sql
  A6  021_tracking_providers.sql
  D1  020_subscriptions.sql
  A3  soft delete sites

Phase 2 — Tenant auth migration
  B1a Backfill users_members từ users và verify duplicate email
  B1b Login/JWT theo users_members với token_type=tenant
  B1c RequireAuth check account/member status
  B2  Tenant role checks theo users_members.role
  B3  Frontend auth store/types
  B4  Cleanup legacy users credentials sau khi ổn định

Phase 3 — Billing enforcement
  D2  BillingService đọc DB
  D3  Subscription access/grace period
  D4  Site limit
  D5  Event quota
  D6  Order Tracking API quota
  D7  Feature gating

Phase 4 — Platform Admin
  C1  Platform admin auth/session riêng + bootstrap CLI
  C2  Admin endpoints
  C3  Admin frontend/app riêng
  A4  Audit logs cho mọi admin action
  E3  Tracking provider management

Phase 5 — System tracking provider settings
  E1  Provider registry service
  E2  Tenant provider settings filter theo system config

Phase 6 — Tenant billing UI
  Billing/usage page cho tenant users
```

---

## Implementation Task List

### Sprint 0 — Preflight

- [ ] Chạy query kiểm tra duplicate email trong `users`; dừng migration nếu có duplicate lower-case email.
- [ ] Xác nhận seed tenant hiện tại: DB mới dùng `john@woosaas.com`; DB cũ rename `admin@woosaas.com` sang `john@woosaas.com`.
- [ ] Liệt kê các code path đang dùng `c.GetString("user_id")` để phân loại: account scope, member scope, hoặc legacy site permission.
- [ ] Liệt kê các query đang join `site_members`; đánh dấu query nào sẽ bỏ, query nào chỉ giữ đọc legacy trong migration window.
- [ ] Chạy baseline `cd api && go test ./...` và ghi lại test đang fail sẵn nếu có.

### Sprint 1 — Database Additive Migrations

- [ ] Tạo `016_users_account_model.sql`: thêm `users.status`, `users.deleted_at`, rename seed legacy sang `john@woosaas.com`.
- [ ] Tạo `017_users_members.sql`: tạo `users_members` với `email UNIQUE`, backfill mỗi `users` thành một owner member.
- [ ] Tạo `019_plans.sql`: tạo `plans`, seed `free/starter/pro`, thêm `tracking_order_limit`, `features`.
- [ ] Tạo `020_subscriptions.sql`: tạo `subscriptions`, backfill `free` subscription cho mọi account active.
- [ ] Tạo `018_platform_admin.sql`: platform admin users, sessions, impersonation sessions, audit logs.
- [ ] Tạo `021_tracking_providers.sql`: seed `17track`, `aftership`, `trackingmore`.
- [ ] Thêm `sites.deleted_at` và indexes.
- [ ] Chạy migration trên DB local sạch và DB local đã có data.

### Sprint 2 — Tenant Auth Migration

- [ ] Thêm models/repository cho `users_members`.
- [ ] Đổi register: tạo transaction gồm `users`, owner `users_members`, free `subscriptions`.
- [ ] Đổi login: authenticate bằng `users_members.email/password_hash`.
- [ ] Đổi JWT claims: `sub=member_id`, `member_id`, `user_id`, `role`, `token_type=tenant`.
- [ ] Đổi `JWTAuth`/`RequireAuth`: reject token không phải tenant, check `users.status`, `users_members.status`.
- [ ] Set Gin context rõ: `user_id`, `account_id`, `member_id`, `member_role`.
- [ ] Force logout/token version bump cho token cũ chỉ có `user_id/email`.
- [ ] Đổi profile/me response: trả `account` và `member` riêng.

### Sprint 3 — Remove `site_members` From Active Authorization

- [ ] Đổi `sites.CreateSite`: không insert `site_members owner` cho site mới.
- [ ] Đổi list/get site: dùng account id từ JWT, không dựa vào `site_members`.
- [ ] Đổi site permission checks: dùng `users_members.role` account-level.
- [ ] Đổi team/member endpoints và UI: đọc/ghi `users_members`, không đọc/ghi `site_members`.
- [ ] Giữ `site_members` table tạm thời để không phá dữ liệu cũ, nhưng không cấp quyền mới từ bảng này.
- [ ] Thêm cleanup task sau rollout: drop `site_members` khi không còn code path dùng bảng này.

### Sprint 4 — Soft Delete Sites

- [ ] Đổi `DeleteSite` thành update `deleted_at`.
- [ ] Thêm `deleted_at IS NULL` vào `GetSiteByID`, `GetSitesByUserID`, `ValidateAPIKey`, API key lookup.
- [ ] Thêm `deleted_at IS NULL` vào order/contact/sync-state queries theo `site_id` nếu endpoint đọc qua tenant UI.
- [ ] Invalidate/revalidate Redis `api_key:*` và `site_owner:*` khi site bị soft-delete.
- [ ] Thêm tests: deleted site không list/get được và API key không collect được.

### Sprint 5 — Billing And Quota Enforcement

- [ ] Refactor `BillingService` đọc `plans` và `subscriptions` từ PostgreSQL.
- [ ] Implement `EnsureFreeSubscription`, `GetPlanForUser`, `UpdateUserPlan`, `CheckSubscriptionAccess`.
- [ ] Enforce site limit trước khi tạo site.
- [ ] Enforce subscription/account status trong tenant routes cần write access.
- [ ] Enforce event quota trong collect path bằng Redis monthly counter.
- [ ] Enforce Order Tracking API feature/quota trước khi add/register/refresh tracking.
- [ ] Tạo usage endpoint cho billing UI: sites, events, tracking orders, period, limits.
- [ ] Thêm tests cho free/starter/pro quota behavior.

### Sprint 6 — Feature Gating

- [ ] Tạo `api/internal/api/middleware/feature.go`.
- [ ] Map stats endpoints vào `basic_analytics`, `all_analytics`, `realtime`.
- [ ] Map Woo sync/export/API surfaces vào `api_access` theo policy.
- [ ] Map shipment tracking endpoints vào `order_tracking_api`.
- [ ] Handler thiếu feature trả 402 với message ổn định cho frontend.

### Sprint 7 — Platform Admin Backend

- [ ] Tạo `api/internal/platform_admin/auth`, `handlers`, `middleware`.
- [ ] Tạo `api/cmd/platform-admin-bootstrap` để tạo first admin.
- [ ] Implement admin login/logout/me bằng `platform_admin_sessions`.
- [ ] Middleware admin reject tenant token và check admin status/session.
- [ ] Implement `/api/admin/v1/users` list/detail/status/plan.
- [ ] Implement `/api/admin/v1/users/:user_id/members` và member status update.
- [ ] Implement `/api/admin/v1/plans` list/update.
- [ ] Implement `/api/admin/v1/audit-logs`.
- [ ] Implement impersonation start/end với `reason`, TTL ngắn, audit logs.
- [ ] Mọi write action nhạy cảm ghi `platform_admin_audit_logs`.

### Sprint 8 — Tracking Provider Registry

- [ ] Tạo `api/internal/tracking_providers/service.go`.
- [ ] Tenant provider settings chỉ trả provider có trong `tracking_providers`.
- [ ] Khi provider bị disabled: chặn set active, add tracking, register, refresh outbound.
- [ ] Webhook existing provider xử lý theo policy, không tạo usage billable mới khi disabled.
- [ ] Platform admin endpoints CRUD/update provider config.
- [ ] Audit action `update_tracking_provider`.

### Sprint 9 — Tenant Frontend

- [ ] Cập nhật auth types/store: `account`, `currentMember`, `role`.
- [ ] Cập nhật login/register/me handling theo response mới.
- [ ] Cập nhật team/member UI sang `users_members`.
- [ ] Cập nhật site create/list/get flows theo account-level roles.
- [ ] Tạo `dashboard/src/app/dashboard/billing/page.tsx`.
- [ ] Hiển thị plan, subscription status, sites usage, event usage, tracking orders usage.
- [ ] Chỉ `owner` và `billing` thấy action đổi plan/manage billing.

### Sprint 10 — Platform Admin Frontend

- [ ] Tạo app/domain hoặc route package riêng cho admin UI, không đặt trong `/dashboard/admin`.
- [ ] Admin login/me/logout flow dùng admin session riêng.
- [ ] Users list/detail/status/plan pages.
- [ ] Plans page.
- [ ] Audit logs page.
- [ ] Tracking providers page.
- [ ] Impersonation start/end UI yêu cầu `reason`.

### Sprint 11 — Final Verification

- [ ] Chạy `cd api && go test ./...`.
- [ ] Chạy dashboard build.
- [ ] Smoke test register/login/me với `john@woosaas.com`.
- [ ] Smoke test tenant token không gọi được `/api/admin/v1/*`.
- [ ] Smoke test platform admin token không gọi được tenant routes.
- [ ] Smoke test free plan site limit, event quota, Order Tracking API 402.
- [ ] Smoke test platform admin đổi plan/status có audit log.
- [ ] Smoke test disable provider làm tenant không set active/register/refresh được.
- [ ] Smoke test soft-delete site giữ history nhưng chặn list/get/collect.

---

## Checklist

### Database

- [ ] `016_users_account_model.sql` — `users.status`, `users.deleted_at`
- [ ] `017_users_members.sql` — login members thuộc `users`
- [ ] Mỗi row `users` hiện tại được giữ làm một account riêng
- [ ] Rename tenant seed legacy `admin@woosaas.com` thành `john@woosaas.com`
- [ ] Backfill `users_members` từ `users` hiện tại
- [ ] Verify duplicate lower-case email trước khi unique global login
- [ ] `users_members.email` có `UNIQUE(email)`
- [ ] Deprecate `site_members`, không dùng làm nguồn quyền chính
- [ ] `018_platform_admin.sql` — internal admin users + sessions + impersonation + audit logs
- [ ] `019_plans.sql` — plans table + seed data
- [ ] `020_subscriptions.sql` — subscriptions gắn với `users.id`
- [ ] `021_tracking_providers.sql` — system provider registry: 17TRACK, AfterShip, TrackingMore
- [ ] Soft delete sites
- [ ] Audit tất cả query `sites` có `deleted_at IS NULL`
- [ ] Cache invalidation/revalidation cho `api_key:*`, `site_owner:*`, `user_status:*`, `member_status:*`

### Tenant App

- [ ] Register tạo `users`, owner `users_members`, subscription free
- [ ] Login bằng `users_members.email`
- [ ] JWT chứa `member_id`, `user_id`, `role`, `token_type=tenant`
- [ ] `RequireAuth` check account/member status
- [ ] Tenant middleware reject platform admin token
- [ ] Role guard cho `owner/admin/member/billing/viewer`
- [ ] Site permission dùng account-level `users_members.role`
- [ ] Site create/list/get không phụ thuộc `site_members`
- [ ] Frontend auth store tách account và member
- [ ] Không dùng `is_admin` trong tenant app

### Billing

- [ ] `BillingService` đọc plans/subscriptions từ DB
- [ ] Site limit theo `users.id`
- [ ] Event quota theo `users.id`
- [ ] Collect API check account status, subscription status, site active trước khi nhận event
- [ ] Order Tracking API quota theo `users.id`
- [ ] Check `tracking_providers.enabled` trước khi gọi provider
- [ ] Subscription grace period
- [ ] Feature gating
- [ ] Tenant billing page

### Tracking Providers

- [ ] Seed `17track`, `aftership`, `trackingmore`
- [ ] Provider registry service
- [ ] Tenant provider settings chỉ dùng providers được platform bật
- [ ] Policy provider disabled: chặn outbound mới, xử lý webhook existing theo policy
- [ ] Platform admin CRUD/update provider config
- [ ] Audit log action `update_tracking_provider`

### Platform Admin

- [ ] `platform_admin_users`
- [ ] Platform admin login/session riêng
- [ ] Bootstrap first admin bằng CLI/seed riêng
- [ ] Platform admin token/session có `token_type=platform_admin`
- [ ] Platform admin middleware reject tenant token
- [ ] `/api/admin/v1/users`
- [ ] `/api/admin/v1/plans`
- [ ] `/api/admin/v1/stats`
- [ ] `/api/admin/v1/audit-logs`
- [ ] `/api/admin/v1/tracking-providers`
- [ ] Impersonation flow có audit
- [ ] Impersonation session có `reason`, TTL ngắn, marker `impersonated_by_admin_id`
- [ ] Admin app/domain riêng

---

## Verification

1. Register tenant app tạo 1 `users`, 1 owner `users_members`, 1 free subscription.
2. Tenant member login nhận JWT có `member_id`, `user_id`, `role`.
3. Disabled `users` không login/request tenant app được.
4. Disabled `users_members` không login/request tenant app được.
5. Tenant role `viewer` không tạo site hoặc đổi billing được.
6. Free account vượt `site_limit` nhận 402.
7. Event ingest vượt `event_limit` nhận 429.
8. Free account gọi Order Tracking API nhận 402 vì thiếu `order_tracking_api`.
9. Starter account vượt `tracking_order_limit` nhận `"Order tracking quota exceeded"`.
10. Platform admin disable `17track`; tenant không set active provider `17track` được.
11. Existing tenant đang dùng provider disabled thấy `platform_enabled: false`.
12. Platform admin update tracking provider tạo row `update_tracking_provider` trong audit logs.
13. Platform admin login không tạo tenant JWT.
14. Tenant member không gọi được `/api/admin/v1/*`.
15. Platform admin đổi plan/status tạo row trong `platform_admin_audit_logs`.
16. Impersonation start/end đều có audit log.
17. Duplicate email trong `users` bị phát hiện trước khi áp dụng `UNIQUE(email)`.
18. Mỗi row `users` cũ có đúng một owner `users_members`.
19. Seed tenant login là `john@woosaas.com`; `admin@woosaas.com` không còn là tenant seed hoặc platform admin.
20. Tenant role từ `users_members.role` quyết định quyền tạo/list/get site, không cần `site_members`.
21. Soft-deleted site không list/get được, API key của site đó không collect được.
22. Platform admin token bị reject ở tenant routes; tenant token bị reject ở `/api/admin/v1/*`.

---

## Affected Files

### Backend mới

- `api/migrations_postgres/016_users_account_model.sql`
- `api/migrations_postgres/017_users_members.sql`
- `api/migrations_postgres/018_platform_admin.sql`
- `api/migrations_postgres/019_plans.sql`
- `api/migrations_postgres/020_subscriptions.sql`
- `api/migrations_postgres/021_tracking_providers.sql`
- `api/internal/platform_admin/auth`
- `api/internal/platform_admin/handlers`
- `api/internal/platform_admin/middleware`
- `api/cmd/platform-admin-bootstrap`
- `api/internal/tracking_providers/service.go`
- `api/internal/api/middleware/feature.go`

### Backend sửa

- `api/internal/auth/service.go` — register/login qua `users_members`
- `api/internal/api/middleware/middleware.go` — tenant auth check account/member status
- `api/internal/billing/service.go` — DB-backed billing
- `api/internal/sites/service.go` — site limit, soft delete, bỏ dependency permission vào `site_members`
- `api/internal/api/handlers/collect.go` — event quota + site to account cache
- `api/internal/api/router.go` — tenant routes và admin routes tách middleware
- `api/internal/shipment_tracking` — check system provider config trước khi gọi provider
- `api/pkg/models/models.go` — thêm account/member/admin models
- `api/cmd/worker/main.go` — subscription expiry worker

### Frontend mới/sửa

- Tenant app:
  - `dashboard/src/lib/types.ts`
  - `dashboard/src/store/`
  - `dashboard/src/app/dashboard/billing/page.tsx`
- Platform admin app:
  - app/domain riêng cho admin UI
  - login, users, plans, stats, audit, incidents, feature flags, tracking providers

---

## Decisions

| Quyết định | Lý do |
|---|---|
| `users` là account/tenant | Theo naming đã chọn, billing/quota/site ownership gắn vào account |
| Mỗi row `users` hiện tại trở thành một account | Migration đơn giản, không merge dữ liệu tenant |
| Seed `john@woosaas.com` là tenant user | Tài khoản seed hiện tại không đại diện platform admin |
| `users_members` là login/member | Tách người đăng nhập khỏi account để hỗ trợ team/roles |
| Email tenant login global unique bằng `UNIQUE(email)` | Login đơn giản, không cần account switcher ở phase đầu |
| Bỏ dần `site_members` | Quyền tenant dùng `users_members.role` account-level, giảm độ phức tạp migration |
| Không dùng `is_admin` | Tránh trộn platform admin vào tenant app |
| Platform admin auth riêng | Đúng boundary bảo mật và vận hành |
| Admin audit lưu DB | Cần truy vấn lại impersonation/billing/status changes |
| Billing gắn `users.id` | Account là customer/subscription boundary |
| Tracking providers là system config | Platform có thể bật/tắt 17TRACK/AfterShip/TrackingMore mà không deploy |
| Per-site tracking API giữ nguyên | Revoke/audit/isolation tốt hơn global key |
