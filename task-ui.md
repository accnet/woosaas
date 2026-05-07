# UI Task Backlog

Muc tieu cua backlog nay la chot toan bo viec UI con lai sau khi da:
- doi shell thanh `App Rail + Domain Sidebar + Top Nav + Content`
- dong bo `Pinned / Recent / All Websites` giua switcher, sidebar, va site registry
- chuan hoa mot phan page analytics chinh

File nay chi tap trung vao viec UI/UX va presentation layer. Khong bao gom backend feature moi tru khi can de ho tro UI.

## 1. Hoan thien page pattern cho toan bo analytics pages

### 1.1 Campaigns
- [ ] Chuyen [dashboard/src/app/dashboard/[siteId]/campaigns/page.tsx](/home/accnet/woosaas/dashboard/src/app/dashboard/[siteId]/campaigns/page.tsx) sang dung `AnalyticsPageHeader`
- [ ] Them date range control dung chung
- [ ] Boc bang/charts trong `SectionCard`
- [ ] Chuan hoa metric cards dau trang
- [ ] Them empty state ro rang khi khong co campaign data

### 1.2 Pages
- [ ] Chuyen [dashboard/src/app/dashboard/[siteId]/pages/page.tsx](/home/accnet/woosaas/dashboard/src/app/dashboard/[siteId]/pages/page.tsx) sang dung `AnalyticsPageHeader`
- [ ] Boc bang pages trong `SectionCard`
- [ ] Hien thi delta/page performance theo cung mot visual pattern voi products
- [ ] Them search/filter cho page path neu danh sach dai

### 1.3 Funnel
- [ ] Chuan hoa [dashboard/src/app/dashboard/[siteId]/funnel/page.tsx](/home/accnet/woosaas/dashboard/src/app/dashboard/[siteId]/funnel/page.tsx) theo cung page header
- [ ] Lam ro hierarchy giua step totals va conversion rates
- [ ] Them section phan tich bottleneck thay vi chi show raw steps

### 1.4 Realtime
- [ ] Chuan hoa [dashboard/src/app/dashboard/[siteId]/realtime/page.tsx](/home/accnet/woosaas/dashboard/src/app/dashboard/[siteId]/realtime/page.tsx) theo `AnalyticsPageHeader`
- [ ] Tach ro `summary`, `live feed`, `filters`
- [ ] Lam trang thai live ro hon: `live`, `paused`, `refreshing`
- [ ] Them sticky toolbar nho cho khoang thoi gian va auto-refresh

### 1.5 Health
- [ ] Chuan hoa [dashboard/src/app/dashboard/[siteId]/health/page.tsx](/home/accnet/woosaas/dashboard/src/app/dashboard/[siteId]/health/page.tsx)
- [ ] Gom health checks thanh nhom: `Collection`, `Processing`, `Delivery`, `Verification`
- [ ] Dung status chips va severity style nhat quan
- [ ] Hien thi quick actions khi state la `attention`

### 1.6 Customers
- [ ] Chuan hoa [dashboard/src/app/dashboard/[siteId]/customers/page.tsx](/home/accnet/woosaas/dashboard/src/app/dashboard/[siteId]/customers/page.tsx)
- [ ] Them search/filter theo email/client id
- [ ] Chuan hoa table header, empty state, pagination controls

### 1.7 Customer Detail
- [ ] Chuan hoa [dashboard/src/app/dashboard/[siteId]/customers/[clientId]/page.tsx](/home/accnet/woosaas/dashboard/src/app/dashboard/[siteId]/customers/[clientId]/page.tsx)
- [ ] Tach `summary`, `orders`, `timeline`, `identity`
- [ ] Them sticky context bar cho customer info chinh

### 1.8 Bots
- [ ] Chuan hoa [dashboard/src/app/dashboard/[siteId]/bots/page.tsx](/home/accnet/woosaas/dashboard/src/app/dashboard/[siteId]/bots/page.tsx)
- [ ] Lam ro scored traffic, suspicious reasons, rule coverage
- [ ] Them visual distinction giua bot report va nguoi dung that

### 1.9 Exports
- [ ] Chuan hoa [dashboard/src/app/dashboard/[siteId]/exports/page.tsx](/home/accnet/woosaas/dashboard/src/app/dashboard/[siteId]/exports/page.tsx)
- [ ] Tach `create export` va `recent exports`
- [ ] Lam ro cac loai export, date range, va readiness state

## 2. Hoan thien setup / operations pages

### 2.1 API Keys
- [ ] Tinh chinh [dashboard/src/app/dashboard/sites/[siteId]/api-keys/page.tsx](/home/accnet/woosaas/dashboard/src/app/dashboard/sites/[siteId]/api-keys/page.tsx)
- [ ] Tach `active keys`, `recently created`, `usage state`
- [ ] Hien thi ro quy tac: full secret chi hien mot lan
- [ ] Them empty state va inline note nhat quan

### 2.2 Onboarding
- [ ] Tinh chinh [dashboard/src/app/dashboard/sites/[siteId]/onboarding/page.tsx](/home/accnet/woosaas/dashboard/src/app/dashboard/sites/[siteId]/onboarding/page.tsx)
- [ ] Chuyen sang stepper hoac checklist ro rang
- [ ] Hien thi progress completion va next blocking step

### 2.3 Team
- [ ] Tinh chinh [dashboard/src/app/dashboard/sites/[siteId]/team/page.tsx](/home/accnet/woosaas/dashboard/src/app/dashboard/sites/[siteId]/team/page.tsx)
- [ ] Chuan hoa member list, role badge, action menu
- [ ] Them empty state cho truong hop chua co user moi

## 3. Global UX layer can bo sung

### 3.1 Date range / filter model
- [ ] Xac dinh co can global date range tren `Top Nav` hay khong
- [ ] Neu co, tao state chung cho analytics pages
- [ ] Neu khong, giu local page filters nhung chuan hoa UI controls

### 3.2 Page actions
- [ ] Chuan hoa action placement giua `header controls` va `section actions`
- [ ] Loai bo cac button trung y nghia giua top nav va page body

### 3.3 Empty states
- [ ] Ra soat tat ca empty state trong dashboard
- [ ] Chuyen sang cung tone, spacing, icon size, va wording

### 3.4 Loading states
- [ ] Chuyen spinner tron don gian sang skeleton o cac page co table/chart
- [ ] Them partial loading state cho date-range refetch

### 3.5 Error states
- [ ] Them inline error state khi fetch fail o page analytics
- [ ] Co retry action ro rang

## 4. Navigation polish con lai

### 4.1 Top Nav
- [ ] Them click-outside close cho site switcher neu chua co day du
- [ ] Them keyboard highlight scroll-into-view neu list dai
- [ ] Them status chips dong nhat voi sidebar va site registry

### 4.2 Domain Sidebar
- [ ] Tinh chinh density cua nav groups trong [dashboard/src/components/ui/dashboard-shell.tsx](/home/accnet/woosaas/dashboard/src/components/ui/dashboard-shell.tsx)
- [ ] Xem xet them section `Recommendations` hoac `Needs attention`
- [ ] Neu no-site state dai, them search nho hoac quick jump

### 4.3 App Rail
- [ ] Them tooltip polished hon cho icon-only nav
- [ ] Xem xet them `active account/workspace label` o footer hoac top nav

### 4.4 Mobile / Tablet
- [ ] Kiem tra drawer tren mobile voi danh sach site dai
- [ ] Them body scroll lock khi drawer mo
- [ ] Them animation open/close mem hon neu can
- [ ] Verify layout tren viewport tablet

## 5. Shared component cleanup

### 5.1 Table primitives
- [ ] Tao shared component cho:
  - `table section wrapper`
  - `table empty state`
  - `table header cell`
  - `table row action zone`
- [ ] Giam lap code trong `sources`, `products`, `pages`, `campaigns`, `customers`

### 5.2 Filter controls
- [ ] Tao shared controls cho:
  - `DateRangeSelect`
  - metric select
  - search input
  - status filter pills

### 5.3 Status chips
- [ ] Tao shared helper/component cho tracking status chip
- [ ] Dung chung o:
  - site switcher
  - sidebar rows
  - site registry
  - setup/health screens

### 5.4 Section header patterns
- [ ] Tiep tuc gom cac pattern header vao shared components
- [ ] Han che hardcode `h2/p/select` trong tung page

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
- [ ] `cd dashboard && npm run build`
- [ ] `docker compose up -d --build dashboard`
- [ ] `docker compose ps`

## 8. Thu tu uu tien de lam tiep

### Phase A
- [ ] `campaigns`
- [ ] `pages`
- [ ] `funnel`
- [ ] `realtime`
- [ ] `health`

### Phase B
- [ ] `customers`
- [ ] `customer detail`
- [ ] `bots`
- [ ] `exports`

### Phase C
- [ ] `api-keys`
- [ ] `team`
- [ ] `onboarding`
- [ ] shared table/filter/status components

### Phase D
- [ ] mobile polish
- [ ] skeleton/error states
- [ ] full visual consistency audit

