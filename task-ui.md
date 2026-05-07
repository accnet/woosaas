# UI Task Backlog

Muc tieu cua backlog nay la chot toan bo viec UI con lai sau khi da:
- doi shell thanh `App Rail + Domain Sidebar + Top Nav + Content`
- dong bo `Pinned / Recent / All Websites` giua switcher, sidebar, va site registry
- chuan hoa mot phan page analytics chinh

File nay chi tap trung vao viec UI/UX va presentation layer. Khong bao gom backend feature moi tru khi can de ho tro UI.

## 1. Hoan thien page pattern cho toan bo analytics pages

### 1.1 Campaigns
- [x] Chuyen [dashboard/src/app/dashboard/[siteId]/campaigns/page.tsx](/home/accnet/woosaas/dashboard/src/app/dashboard/[siteId]/campaigns/page.tsx) sang dung `AnalyticsPageHeader`
- [x] Them date range control dung chung
- [x] Boc bang/charts trong `SectionCard`
- [x] Chuan hoa metric cards dau trang
- [x] Them empty state ro rang khi khong co campaign data

### 1.2 Pages
- [x] Chuyen [dashboard/src/app/dashboard/[siteId]/pages/page.tsx](/home/accnet/woosaas/dashboard/src/app/dashboard/[siteId]/pages/page.tsx) sang dung `AnalyticsPageHeader`
- [x] Boc bang pages trong `SectionCard`
- [x] Hien thi delta/page performance theo cung mot visual pattern voi products
- [x] Them search/filter cho page path neu danh sach dai

### 1.3 Funnel
- [x] Chuan hoa [dashboard/src/app/dashboard/[siteId]/funnel/page.tsx](/home/accnet/woosaas/dashboard/src/app/dashboard/[siteId]/funnel/page.tsx) theo cung page header
- [x] Lam ro hierarchy giua step totals va conversion rates
- [x] Them section phan tich bottleneck thay vi chi show raw steps

### 1.4 Realtime
- [x] Chuan hoa [dashboard/src/app/dashboard/[siteId]/realtime/page.tsx](/home/accnet/woosaas/dashboard/src/app/dashboard/[siteId]/realtime/page.tsx) theo `AnalyticsPageHeader`
- [x] Tach ro `summary`, `live feed`, `filters`
- [x] Lam trang thai live ro hon: `live`, `paused`, `refreshing`
- [x] Them sticky toolbar nho cho khoang thoi gian va auto-refresh

### 1.5 Health
- [x] Chuan hoa [dashboard/src/app/dashboard/[siteId]/health/page.tsx](/home/accnet/woosaas/dashboard/src/app/dashboard/[siteId]/health/page.tsx)
- [x] Gom health checks thanh nhom: `Collection`, `Processing`, `Delivery`, `Verification`
- [x] Dung status chips va severity style nhat quan
- [x] Hien thi quick actions khi state la `attention`

### 1.6 Customers
- [x] Chuan hoa [dashboard/src/app/dashboard/[siteId]/customers/page.tsx](/home/accnet/woosaas/dashboard/src/app/dashboard/[siteId]/customers/page.tsx)
- [x] Them search/filter theo email/client id
- [x] Chuan hoa table header, empty state, pagination controls

### 1.7 Customer Detail
- [x] Chuan hoa [dashboard/src/app/dashboard/[siteId]/customers/[clientId]/page.tsx](/home/accnet/woosaas/dashboard/src/app/dashboard/[siteId]/customers/[clientId]/page.tsx)
- [x] Tach `summary`, `orders`, `timeline`, `identity`
- [x] Them sticky context bar cho customer info chinh

### 1.8 Bots
- [x] Chuan hoa [dashboard/src/app/dashboard/[siteId]/bots/page.tsx](/home/accnet/woosaas/dashboard/src/app/dashboard/[siteId]/bots/page.tsx)
- [x] Lam ro scored traffic, suspicious reasons, rule coverage
- [x] Them visual distinction giua bot report va nguoi dung that

### 1.9 Exports
- [x] Chuan hoa [dashboard/src/app/dashboard/[siteId]/exports/page.tsx](/home/accnet/woosaas/dashboard/src/app/dashboard/[siteId]/exports/page.tsx)
- [x] Tach `create export` va `recent exports`
- [x] Lam ro cac loai export, date range, va readiness state

## 2. Hoan thien setup / operations pages

### 2.1 API Keys
- [x] Tinh chinh [dashboard/src/app/dashboard/sites/[siteId]/api-keys/page.tsx](/home/accnet/woosaas/dashboard/src/app/dashboard/sites/[siteId]/api-keys/page.tsx)
- [x] Tach `active keys`, `recently created`, `usage state`
- [x] Hien thi ro quy tac: full secret chi hien mot lan
- [x] Them empty state va inline note nhat quan

### 2.2 Onboarding
- [x] Tinh chinh [dashboard/src/app/dashboard/sites/[siteId]/onboarding/page.tsx](/home/accnet/woosaas/dashboard/src/app/dashboard/sites/[siteId]/onboarding/page.tsx)
- [x] Chuyen sang stepper hoac checklist ro rang
- [x] Hien thi progress completion va next blocking step

### 2.3 Team
- [x] Tinh chinh [dashboard/src/app/dashboard/sites/[siteId]/team/page.tsx](/home/accnet/woosaas/dashboard/src/app/dashboard/sites/[siteId]/team/page.tsx)
- [x] Chuan hoa member list, role badge, action menu
- [x] Them empty state cho truong hop chua co user moi

## 3. Global UX layer can bo sung

### 3.1 Date range / filter model
- [x] Xac dinh co can global date range tren `Top Nav` hay khong
- [ ] Neu co, tao state chung cho analytics pages
- [x] Neu khong, giu local page filters nhung chuan hoa UI controls

### 3.2 Page actions
- [x] Chuan hoa action placement giua `header controls` va `section actions`
- [ ] Loai bo cac button trung y nghia giua top nav va page body

### 3.3 Empty states
- [x] Ra soat tat ca empty state trong dashboard
- [x] Chuyen sang cung tone, spacing, icon size, va wording

### 3.4 Loading states
- [x] Chuyen spinner tron don gian sang skeleton o cac page co table/chart
- [x] Them partial loading state cho date-range refetch

### 3.5 Error states
- [x] Them inline error state khi fetch fail o page analytics
- [x] Co retry action ro rang

## 4. Navigation polish con lai

### 4.1 Top Nav
- [x] Them click-outside close cho site switcher neu chua co day du
- [x] Them keyboard highlight scroll-into-view neu list dai
- [x] Them status chips dong nhat voi sidebar va site registry

### 4.2 Domain Sidebar
- [x] Tinh chinh density cua nav groups trong [dashboard/src/components/ui/dashboard-shell.tsx](/home/accnet/woosaas/dashboard/src/components/ui/dashboard-shell.tsx)
- [x] Xem xet them section `Recommendations` hoac `Needs attention`
- [x] Neu no-site state dai, them search nho hoac quick jump

### 4.3 App Rail
- [x] Them tooltip polished hon cho icon-only nav
- [x] Xem xet them `active account/workspace label` o footer hoac top nav

### 4.4 Mobile / Tablet
- [x] Kiem tra drawer tren mobile voi danh sach site dai
- [x] Them body scroll lock khi drawer mo
- [x] Them animation open/close mem hon neu can
- [ ] Verify layout tren viewport tablet

## 5. Shared component cleanup

### 5.1 Table primitives
- [x] Tao shared component cho:
  - `table section wrapper`
  - `table empty state`
  - `table header cell`
  - `table row action zone`
- [x] Giam lap code trong `sources`, `products`, `pages`, `campaigns`, `customers`

### 5.2 Filter controls
- [x] Tao shared controls cho:
  - `DateRangeSelect`
  - search input
  - status filter pills
  - metric select

### 5.3 Status chips
- [x] Tao shared helper/component cho tracking status chip
- [x] Dung chung o:
  - site switcher
  - sidebar rows
  - site registry
  - setup/health screens

### 5.4 Section header patterns
- [x] Tiep tuc gom cac pattern header vao shared components
- [x] Han che hardcode `h2/p/select` trong tung page

## 6. Visual consistency audit

### 6.1 Typography
- [ ] Ra soat heading scale giua shell, page title, section title, table title
- [ ] Giam cho nao dang qua to hoac qua nho

### 6.2 Spacing
- [ ] Chuan hoa vertical rhythm:
  - page header
  - metric row
  - section card
  - tables

### 6.3 Status colors
- [ ] Dung mot he mau nhat quan cho:
  - Active
  - Verified
  - Pending
  - Warning / Attention

### 6.4 Dense data screens
- [ ] Test sources/products/pages/customers voi data dai
- [ ] Kiem tra text truncate, nowrap, va scroll ngang

## 7. QA / verification can lam

### 7.1 Browser verification
- [ ] Kiem tra desktop:
  - `/dashboard`
  - `/dashboard/sites`
  - `/dashboard/:siteId/overview`
  - `/dashboard/:siteId/trend`
  - `/dashboard/:siteId/sources`
  - `/dashboard/:siteId/products`
  - `/dashboard/:siteId/realtime`
  - `/dashboard/:siteId/health`
- [ ] Kiem tra mobile/tablet cho shell va site switcher

### 7.2 State verification
- [ ] Verify `Pinned / Recent` sync dung giua:
  - top switcher
  - no-site sidebar
  - sites registry
- [ ] Verify route-preserving khi doi site

### 7.3 Runtime verification
- [x] `cd dashboard && npm run build`
- [x] `docker compose up -d --build dashboard`
- [x] `docker compose ps`

## 8. Thu tu uu tien de lam tiep

### Phase A
- [x] `campaigns`
- [x] `pages`
- [x] `funnel`
- [x] `realtime`
- [x] `health`

### Phase B
- [x] `customers`
- [x] `customer detail`
- [x] `bots`
- [x] `exports`

### Phase C
- [x] `api-keys`
- [x] `team`
- [x] `onboarding`
- [x] shared table/filter/status components

### Phase D
- [x] mobile polish
- [x] skeleton/error states
- [ ] full visual consistency audit
