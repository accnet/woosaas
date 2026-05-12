# Plan: Global Settings

## Context

Dashboard settings hiện đang bị lệch khỏi nhu cầu mới:

- `settingsRootNav` đang trỏ về `/dashboard/teams`
- `settingsNav` hiện chỉ có `Teams`
- `/dashboard/teams` đang là trang quản lý member hệ thống và phân quyền, không phải trung tâm settings
- Chưa có global settings menu gồm `General`, `Authentication`, `Billing Information`, `Invoices`
- Backend đã có auth cơ bản, user repository, billing service stub, nhưng chưa có API/profile/billing settings hoàn chỉnh

Mô hình sản phẩm hiện tại:

- Mỗi `user` có thể quản lý nhiều `site`
- Không có khái niệm `project` hoặc `workspace`
- Team chỉ dùng để mời member vào hệ thống và phân quyền truy cập/chức năng

Team model cần giữ rõ:

- Không thiết kế team theo project/workspace
- Member được mời vào hệ thống dưới user/account hiện tại
- Phân quyền quyết định member được xem/sửa những phần nào của hệ thống
- Nếu cần phân quyền theo site, dùng trực tiếp `site_id` trong permission/access rule, không tạo thêm project/workspace layer

Mục tiêu v1: tạo khu vực **Settings** cấp user dùng chung cho dashboard, với 4 menu:

```text
Settings
  General
  Authentication
  Billing Information
  Invoices
```

> Settings v1 lưu theo `user_id`. `timezone` và `currency` trong settings là default/fallback cấp user; report và commerce data vẫn ưu tiên cấu hình riêng của từng site.

---

## Target Routes

```text
/dashboard/settings
/dashboard/settings/general
/dashboard/settings/authentication
/dashboard/settings/billing
/dashboard/settings/invoices
```

Route behavior:

- `/dashboard/settings` redirect sang `/dashboard/settings/general`
- `General` là default tab
- `Teams` không còn nằm trong settings menu mới; giữ `/dashboard/teams` như trang quản lý member hệ thống và phân quyền riêng

---

## Menu

**File:** `dashboard/src/lib/navigation.ts`

Update imports:

```ts
import {
  CreditCard,
  FileText,
  LockKeyhole,
  Settings2,
} from 'lucide-react'
```

Update `settingsRootNav`:

```ts
export const settingsRootNav: NavItem[] = [
  { href: '/dashboard/settings/general', label: 'Setting', icon: Settings2 },
]
```

Replace `settingsNav`:

```ts
export const settingsNav: NavItem[] = [
  { href: '/dashboard/settings/general', label: 'General', icon: Settings2 },
  { href: '/dashboard/settings/authentication', label: 'Authentication', icon: LockKeyhole },
  { href: '/dashboard/settings/billing', label: 'Billing Information', icon: CreditCard },
  { href: '/dashboard/settings/invoices', label: 'Invoices', icon: FileText },
]
```

Update route helpers:

```ts
export function isSettingsRoute(pathname: string) {
  return pathname === '/dashboard/settings' || pathname.startsWith('/dashboard/settings/')
}
```

Update `buildPageMeta()`:

- `/dashboard/settings/general` -> title `General`
- `/dashboard/settings/authentication` -> title `Authentication`
- `/dashboard/settings/billing` -> title `Billing Information`
- `/dashboard/settings/invoices` -> title `Invoices`

---

## Backend: General Settings

### Migration

**File mới:** `api/migrations_postgres/004_user_settings.sql`

Create table:

```sql
CREATE TABLE IF NOT EXISTS user_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    default_date_range VARCHAR(20) NOT NULL DEFAULT '7d',
    dashboard_density VARCHAR(20) NOT NULL DEFAULT 'comfortable',
    landing_page VARCHAR(20) NOT NULL DEFAULT 'sites',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

Allowed values:

- `default_date_range`: `24h`, `7d`, `30d`, `90d`
- `dashboard_density`: `comfortable`, `compact`
- `landing_page`: `sites`, `dashboard`

### Models

**File:** `api/pkg/models/models.go`

Add:

```go
type UserSettings struct {
    UserID           string    `json:"user_id"`
    Timezone         string    `json:"timezone"`
    Currency         string    `json:"currency"`
    DefaultDateRange string    `json:"default_date_range"`
    DashboardDensity string    `json:"dashboard_density"`
    LandingPage      string    `json:"landing_page"`
    CreatedAt        time.Time `json:"created_at"`
    UpdatedAt        time.Time `json:"updated_at"`
}

type UpdateUserSettingsRequest struct {
    Timezone         string `json:"timezone,omitempty"`
    Currency         string `json:"currency,omitempty"`
    DefaultDateRange string `json:"default_date_range,omitempty"`
    DashboardDensity string `json:"dashboard_density,omitempty"`
    LandingPage      string `json:"landing_page,omitempty"`
}
```

### Repository/Handler

Add a small settings repository/handler:

```text
api/internal/settings/repository.go
api/internal/api/handlers/settings.go
```

Endpoints:

```http
GET /api/v1/settings
PUT /api/v1/settings
```

Behavior:

- `GET` returns defaults if no row exists
- `PUT` validates enum fields
- `PUT` merges omitted fields with existing/default values
- settings are always scoped to authenticated `user_id`

Register routes inside the existing JWT dashboard group.

---

## Backend: Authentication

### User Repository

**File:** `api/internal/users/repository.go`

Add:

```go
func (r *Repository) UpdateUser(ctx context.Context, id, name string) (*models.User, error)
func (r *Repository) UpdatePassword(ctx context.Context, id, passwordHash string) error
```

Update interface in `api/internal/users/ports.go`.

### Auth Service

**File:** `api/internal/auth/service.go`

Add:

```go
func (s *Service) UpdateProfile(ctx context.Context, userID, name string) (*models.User, error)
func (s *Service) ChangePassword(ctx context.Context, userID, currentPassword, newPassword string) error
```

Rules:

- current password must match existing password hash
- new password must be at least 8 chars
- password is stored via existing `HashPassword()`

### Handler/Routes

**File:** `api/internal/api/handlers/auth.go`

Add:

```http
PUT /api/v1/me
PUT /api/v1/me/password
```

Models:

```go
type UpdateProfileRequest struct {
    Name string `json:"name" validate:"required,min=1,max=255"`
}

type ChangePasswordRequest struct {
    CurrentPassword string `json:"current_password" validate:"required"`
    NewPassword     string `json:"new_password" validate:"required,min=8"`
}
```

---

## Backend: Billing Information

### Migration

**File mới:** `api/migrations_postgres/005_billing_profiles.sql`

Create table:

```sql
CREATE TABLE IF NOT EXISTS billing_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    billing_name TEXT NOT NULL DEFAULT '',
    company TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    tax_id TEXT NOT NULL DEFAULT '',
    address_line1 TEXT NOT NULL DEFAULT '',
    address_line2 TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT '',
    postal_code TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### API

Endpoints:

```http
GET /api/v1/billing/profile
PUT /api/v1/billing/profile
```

Behavior:

- `GET` returns empty/default billing profile if no row exists
- `PUT` upserts billing profile by authenticated `user_id`
- no payment provider integration in v1

---

## Backend: Invoices

### Migration

**File mới:** `api/migrations_postgres/006_invoices.sql`

Create table:

```sql
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    amount_cents BIGINT NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    issued_at TIMESTAMP WITH TIME ZONE,
    due_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    hosted_url TEXT NOT NULL DEFAULT '',
    pdf_url TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_user_id_created_at
    ON invoices (user_id, created_at DESC);
```

Allowed status values for UI display:

- `draft`
- `open`
- `paid`
- `void`
- `uncollectible`

Endpoint:

```http
GET /api/v1/billing/invoices
```

Behavior:

- returns invoices for authenticated `user_id`
- empty list is valid
- download/open buttons only render if `pdf_url` or `hosted_url` exists

---

## Dashboard: Shared Types/API

**File:** `dashboard/src/lib/types.ts`

Add:

```ts
export interface UserSettings {
  user_id: string
  timezone: string
  currency: string
  default_date_range: '24h' | '7d' | '30d' | '90d'
  dashboard_density: 'comfortable' | 'compact'
  landing_page: 'sites' | 'dashboard'
  created_at: string
  updated_at: string
}

export interface UpdateUserSettingsInput {
  timezone?: string
  currency?: string
  default_date_range?: UserSettings['default_date_range']
  dashboard_density?: UserSettings['dashboard_density']
  landing_page?: UserSettings['landing_page']
}

export interface UpdateProfileInput {
  name: string
}

export interface ChangePasswordInput {
  current_password: string
  new_password: string
}

export interface BillingProfile {
  billing_name: string
  company: string
  email: string
  phone: string
  tax_id: string
  address_line1: string
  address_line2: string
  city: string
  state: string
  postal_code: string
  country: string
}

export interface Invoice {
  id: string
  invoice_number: string
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'
  amount_cents: number
  currency: string
  issued_at: string | null
  due_at: string | null
  paid_at: string | null
  hosted_url: string
  pdf_url: string
  created_at: string
}
```

**File:** `dashboard/src/lib/api.ts`

Add:

```ts
export const settingsApi = {
  get: () => api.get<UserSettings>('/api/v1/settings'),
  update: (data: UpdateUserSettingsInput) => api.put<UserSettings>('/api/v1/settings', data),
}

export const profileApi = {
  update: (data: UpdateProfileInput) => api.put<User>('/api/v1/me', data),
  changePassword: (data: ChangePasswordInput) => api.put('/api/v1/me/password', data),
}

export const billingApi = {
  getProfile: () => api.get<BillingProfile>('/api/v1/billing/profile'),
  updateProfile: (data: BillingProfile) => api.put<BillingProfile>('/api/v1/billing/profile', data),
  listInvoices: () => api.get<Invoice[]>('/api/v1/billing/invoices'),
}
```

---

## Dashboard Pages

### Settings Redirect

**File mới:** `dashboard/src/app/dashboard/settings/page.tsx`

Redirect to `/dashboard/settings/general`.

### General

**File mới:** `dashboard/src/app/dashboard/settings/general/page.tsx`

Fields:

- Default timezone select
- Default currency select
- Default date range select
- Dashboard density select
- Landing page select

Copy/description trong UI:

- `Default timezone`: dùng để prefill khi tạo website mới và làm fallback nếu website chưa cấu hình timezone. Mỗi website vẫn giữ timezone riêng.
- `Default currency`: dùng để prefill khi tạo website mới và làm fallback nếu website chưa cấu hình currency. Mỗi website vẫn giữ currency riêng.

Save:

- calls `settingsApi.update`
- shows inline saved/error state

### Authentication

**File mới:** `dashboard/src/app/dashboard/settings/authentication/page.tsx`

Sections:

- Personal info
  - Name editable
  - Email read-only
  - Save calls `profileApi.update`
  - update `useAuthStore` user after success
- Password
  - Current password
  - New password
  - Confirm password
  - client-side confirm check
  - save calls `profileApi.changePassword`

### Billing Information

**File mới:** `dashboard/src/app/dashboard/settings/billing/page.tsx`

Fields:

- Billing name
- Company
- Billing email
- Phone
- Tax ID
- Address line 1
- Address line 2
- City
- State/region
- Postal code
- Country

Save:

- calls `billingApi.updateProfile`
- shows inline saved/error state

### Invoices

**File mới:** `dashboard/src/app/dashboard/settings/invoices/page.tsx`

Table columns:

- Invoice
- Status
- Issued
- Due
- Amount
- Actions

States:

- loading skeleton
- empty state: no invoices
- error state with retry

Actions:

- `View` if `hosted_url`
- `Download PDF` if `pdf_url`

---

## Apply Settings

General settings should be used in these places after the settings API exists:

- `default_date_range`: initialize dashboard date range hook/context
- `timezone`: default when creating a new site and fallback only when a site has no timezone
- `currency`: default when creating a new site and fallback only when a site has no currency
- `dashboard_density`: add root/body class or context flag for compact table spacing
- `landing_page`: decide default `/dashboard` behavior

Precedence rules:

```text
analytics timezone = site.timezone || user_settings.timezone || 'UTC'
new site default timezone = user_settings.timezone || 'UTC'

display currency = site.currency || user_settings.currency || 'USD'
new site default currency = user_settings.currency || 'USD'
```

Do not block the initial settings pages on applying all preferences globally. The first acceptance target is CRUD + navigation; preference application can be incremental in the same feature branch.

---

## Tests

### Backend

Run:

```bash
cd api
go test ./...
```

Add/cover:

- `GET /api/v1/settings` returns defaults with no row
- `PUT /api/v1/settings` persists valid values
- invalid enum values return `400`
- settings are isolated by authenticated user
- `PUT /api/v1/me` updates name
- `PUT /api/v1/me/password` rejects wrong current password
- billing profile get/upsert works for current user
- invoices endpoint returns only current user invoices

### Dashboard

Run:

```bash
npm --prefix dashboard run build
```

Manual checks:

- Settings sidebar shows exactly: General, Authentication, Billing Information, Invoices
- `/dashboard/settings` redirects to General
- each settings page has loading, save, success, and error states
- Authentication page updates auth store after profile save
- Invoices page renders empty state when API returns `[]`

---

## File Checklist

### New files

| File | Purpose |
| --- | --- |
| `api/migrations_postgres/004_user_settings.sql` | general settings storage |
| `api/migrations_postgres/005_billing_profiles.sql` | billing information storage |
| `api/migrations_postgres/006_invoices.sql` | invoice records |
| `api/internal/settings/repository.go` | user settings repository |
| `api/internal/api/handlers/settings.go` | settings API handler |
| `dashboard/src/app/dashboard/settings/page.tsx` | redirect |
| `dashboard/src/app/dashboard/settings/general/page.tsx` | General page |
| `dashboard/src/app/dashboard/settings/authentication/page.tsx` | Authentication page |
| `dashboard/src/app/dashboard/settings/billing/page.tsx` | Billing Information page |
| `dashboard/src/app/dashboard/settings/invoices/page.tsx` | Invoices page |

### Modified files

| File | Change |
| --- | --- |
| `dashboard/src/lib/navigation.ts` | settings menu and route matching |
| `dashboard/src/lib/api.ts` | settings/profile/billing API clients |
| `dashboard/src/lib/types.ts` | settings/profile/billing/invoice types |
| `dashboard/src/components/ui/dashboard-shell.tsx` | settings links use new routes |
| `api/pkg/models/models.go` | settings/profile/billing/invoice models |
| `api/internal/users/repository.go` | profile/password update methods |
| `api/internal/users/ports.go` | user repository interface |
| `api/internal/auth/service.go` | profile/password service methods |
| `api/internal/api/handlers/auth.go` | profile/password handlers |
| `api/internal/api/router.go` | register settings/auth/billing routes |

---

## Out of Scope For v1

- Stripe/payment provider integration
- invoice PDF generation
- workspace/project/organization features
- per-site settings redesign
- WordPress plugin settings changes
- team/member permission redesign
