# Plan: Hoàn thiện chức năng Teams / Member

## Trạng thái hiện tại

### Đã có (working)
- Schema `site_members` (PostgreSQL) với UNIQUE(site_id, user_id)
- 4 roles: `owner`, `admin`, `editor`, `viewer` với permission matrix
- API CRUD: GET/POST/PUT/DELETE `/api/v1/sites/:site_id/members`
- `sites.Repository` thực hiện đầy đủ DB logic (GetMembers, AddByEmail, UpdateRole, Remove)
- `UserHasSitePermission` + `TenantMiddleware` bảo vệ tất cả routes
- `ensureOwnerMembership` tự động sync owner vào `site_members`
- UI page `/dashboard/sites/[siteId]/team` với table, inline role editor, remove button

### Chưa có / Thiếu sót
1. **Invite flow**: Backend chỉ add trực tiếp theo email — user phải có account trước. Không có bảng `site_invites`, không gửi email, không có token acceptance.
2. **`TeamsService` là stub**: `AddMember`, `GetMembers`, `UpdateMemberRole`, `RemoveMember` không làm gì — logic thực tế nằm toàn bộ trong `sites.Repository`. Hai class trùng vai trò.
3. **Không có self-leave**: User không thể tự rời site (chỉ owner mới remove được).
4. **Không có "Leave site" endpoint**: Thiếu `DELETE /api/v1/sites/:site_id/members/me`.
5. **Thiếu role escalation guard**: `admin` có thể set role người khác lên `admin` (ngang mình). Cần chặn promote lên role cao hơn hoặc bằng role của người thực hiện.
6. **`editor` permission sai tên**: Permissions chỉ là `site:read` + `export:read` — thực tế là "Viewer+" chứ không phải "Editor". Cần review lại.
7. **UI chưa permission-gate**: Invite form và Remove button hiển thị với tất cả roles — cần ẩn/disable với `viewer` và `editor`.
8. **Không có pending invites section trên UI**.
9. **Không có confirm dialog trước khi remove member**.

---

## Các task cần làm

### Backend

#### B1 — Xóa `TeamsService` stub, dùng thống nhất `sites.Repository`
- **File**: `api/internal/teams/service.go`
- **Việc làm**: Giữ lại phần `Roles`, `HasPermission`, `PermissionsForRole`, `IsValidRole`, `ValidationError`. Xóa `TeamsService` struct và các method stub (chúng không được gọi từ đâu — logic thực ở `sites.Repository`).
- **Lý do**: Tránh nhầm lẫn khi đọc code — hiện tại có 2 nơi xử lý member logic.

#### B2 — Thêm role escalation guard trong `UpdateSiteMemberRole`
- **File**: `api/internal/sites/service.go`
- **Việc làm**: Khi update role, kiểm tra role của người thực hiện (`actorRole`) — không cho phép set role >= role của actor.
  ```
  owner  → có thể set admin/editor/viewer
  admin  → chỉ được set editor/viewer (không set admin)
  editor/viewer → không thể gọi endpoint này (blocked bởi permission "users:write")
  ```
- **Handler change**: `UpdateSiteMember` cần lấy `actorRole` từ `GetUserSiteRole` và truyền vào repository.

#### B3 — Thêm endpoint "Leave site" (self-remove)
- **File**: `api/internal/api/handlers/sites.go`, `api/internal/sites/service.go`, `api/internal/api/router.go`
- **Endpoint**: `DELETE /api/v1/sites/:site_id/members/me`
- **Logic**:
  - Lấy `userID` từ JWT context
  - Lookup `memberID` của user đó trong site
  - Block nếu role = `owner` (owner không được tự rời)
  - Xóa khỏi `site_members`
- **Route**: Thêm trước route `/:member_id` để tránh conflict.

#### B4 — Invite flow (email-based, token)
> Task lớn, có thể làm sau B1-B3.

**B4.1 — Migration: bảng `site_invites`**
- **File mới**: `api/migrations_postgres/002_site_invites.sql`
```sql
CREATE TABLE IF NOT EXISTS site_invites (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    invited_by  UUID NOT NULL REFERENCES users(id),
    email       VARCHAR(255) NOT NULL,
    role        VARCHAR(50) NOT NULL DEFAULT 'viewer',
    token       VARCHAR(64) UNIQUE NOT NULL,
    status      VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | accepted | expired | cancelled
    expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    accepted_at TIMESTAMP WITH TIME ZONE,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(site_id, email)
);
CREATE INDEX IF NOT EXISTS idx_site_invites_token ON site_invites(token);
CREATE INDEX IF NOT EXISTS idx_site_invites_site_id ON site_invites(site_id);
CREATE INDEX IF NOT EXISTS idx_site_invites_email ON site_invites(email);
```

**B4.2 — Model và Repository**
- Thêm `SiteInvite` struct vào `api/pkg/models/models.go`
- Thêm vào `sites.Repository`:
  - `CreateInvite(ctx, siteID, invitedBy, email, role) (*SiteInvite, error)` — nếu user đã có account thì add trực tiếp, nếu chưa thì tạo invite record
  - `GetPendingInvites(ctx, siteID) ([]SiteInvite, error)`
  - `AcceptInvite(ctx, token, userID) error` — verify token chưa expired, add vào `site_members`, mark accepted
  - `CancelInvite(ctx, siteID, inviteID) error`
  - `ExpireOldInvites(ctx) error` — dùng cho worker/cron

**B4.3 — Handler và Routes**
```
POST   /api/v1/sites/:site_id/invites           → tạo invite, gửi email
GET    /api/v1/sites/:site_id/invites           → list pending invites
DELETE /api/v1/sites/:site_id/invites/:invite_id → cancel invite
GET    /api/v1/invites/:token                   → public: xem thông tin invite (không cần auth)
POST   /api/v1/invites/:token/accept            → cần auth: accept invite
```

**B4.4 — Email notification**
- Tích hợp với `internal/helpdesk` hoặc SMTP service đã có
- Template email: "You've been invited to [site name] as [role]. Accept here: [link]"

**B4.5 — Worker: expire invites**
- Thêm job vào `api/internal/worker/consumer.go` chạy daily để expire invites quá hạn

#### B5 — Fix `editor` role permissions
- **File**: `api/internal/teams/service.go`
- **Xem xét**: Rename `editor` → `analyst` hoặc bổ sung permissions thực tế cho editor:
  - Phương án A (rename): `editor` → `analyst` (chỉ xem + export)
  - Phương án B (mở rộng): Thêm permissions thực cho editor như cấu hình campaigns, funnels
- **Lưu ý**: Nếu đổi tên role cần migration UPDATE data cũ.

---

### Frontend

#### F1 — Permission-gate Invite form và Remove button
- **File**: `dashboard/src/app/dashboard/sites/[siteId]/team/page.tsx`
- **Việc làm**:
  - Ẩn toàn bộ "Invite Member" section nếu `currentUserRole` không có permission `users:write` (viewer, editor)
  - Ẩn "Save role" button với viewer/editor
  - Disable Remove button nếu `currentUserRole` không có `users:delete`
  - Role select: chỉ show options <= role của current user (admin không show "admin" option khi đang chọn cho người khác)

#### F2 — Confirm dialog trước khi Remove member
- **File**: `dashboard/src/app/dashboard/sites/[siteId]/team/page.tsx`
- **Việc làm**: Thêm inline confirm state ("Are you sure? [Confirm] [Cancel]") thay vì xóa ngay khi click.
- Có thể dùng pattern đơn giản: `removingConfirm: string | null` state, click lần 1 set confirm, lần 2 mới call API.

#### F3 — "Leave site" button cho non-owner members
- **File**: `dashboard/src/app/dashboard/sites/[siteId]/team/page.tsx`
- **Việc làm**: Thêm button "Leave site" hiển thị khi `currentUserRole !== 'owner'`. Đặt ở header hoặc cuối trang, call endpoint `DELETE /members/me`.
- Sau khi leave thành công, redirect về `/dashboard/sites`.

#### F4 — Pending invites section (sau khi làm B4)
- **File**: `dashboard/src/app/dashboard/sites/[siteId]/team/page.tsx`
- **Việc làm**: Thêm `TableSection` mới hiển thị pending invites với email, role, expiry, và nút Cancel.
- Chỉ hiển thị với `users:write` permission.

#### F5 — Accept invite page (sau khi làm B4)
- **File mới**: `dashboard/src/app/invite/[token]/page.tsx`
- **Luồng**:
  1. Load invite info từ `GET /api/v1/invites/:token`
  2. Nếu chưa login → redirect đến `/login?redirect=/invite/:token`
  3. Nếu đã login → hiển thị site name + role → button "Accept"
  4. Sau accept → redirect về `/dashboard/sites/:siteId`

#### F6 — Cập nhật `sitesApi` trong `api.ts` (sau khi làm B3, B4)
- Thêm: `leaveSite(id: string)`, `getInvites(id: string)`, `cancelInvite(id, inviteId)`, `acceptInvite(token)`

---

## Thứ tự thực hiện

```
Phase 1 — Cleanup & Guards (không có breaking change)
  B1  Xóa TeamsService stub
  B2  Role escalation guard
  B5  Fix editor role (phương án A: rename)
  F1  Permission-gate UI
  F2  Confirm dialog remove

Phase 2 — Self-service (nhỏ, standalone)
  B3  Leave site endpoint
  F3  Leave site UI + redirect

Phase 3 — Invite flow (lớn, cần migration)
  B4.1  Migration site_invites
  B4.2  Model + Repository
  B4.3  Handlers + Routes
  B4.4  Email notification
  B4.5  Worker expire
  F4    Pending invites section
  F5    Accept invite page
  F6    Update sitesApi
```

---

## Checklist

### Phase 1
- [ ] B1: Xóa `TeamsService` methods stub trong `teams/service.go`
- [ ] B2: Thêm actorRole param vào `UpdateSiteMemberRole`, check escalation
- [ ] B2: Cập nhật `UpdateSiteMember` handler truyền actorRole
- [ ] B5: Quyết định phương án đổi `editor` role
- [ ] F1: Hide invite form với viewer/editor
- [ ] F1: Lọc role options theo role của current user
- [ ] F1: Disable/hide remove button theo permission
- [ ] F2: Inline confirm state trước khi remove

### Phase 2
- [ ] B3: Thêm `RemoveSelfFromSite` vào `sites.Repository`
- [ ] B3: Thêm `LeaveSite` handler
- [ ] B3: Đăng ký route `DELETE /sites/:site_id/members/me`
- [ ] F3: Thêm Leave button trên UI
- [ ] F3: Redirect sau leave

### Phase 3
- [ ] B4.1: Tạo migration 002_site_invites.sql
- [ ] B4.2: Thêm SiteInvite model
- [ ] B4.2: Implement CreateInvite, GetPendingInvites, AcceptInvite, CancelInvite
- [ ] B4.3: InviteHandler với 5 endpoints
- [ ] B4.4: Email template + send
- [ ] B4.5: Worker job expire invites
- [ ] F4: Pending invites section
- [ ] F5: Accept invite page
- [ ] F6: Cập nhật sitesApi helpers
