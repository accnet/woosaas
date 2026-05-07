# Dashboard UI V2

## Muc tieu

Chuyen dashboard tu `analytics-first` sang `website workspace with apps`.

- Moi website la mot don vi quan ly chinh
- Moi website se co nhieu app:
  - Analytics
  - Support Tickets
  - Email Campaigns
- Logic va report Analytics hien tai duoc giu nguyen
- Shell, IA, va navigation duoc to chuc lai de san sang cho mo rong

## Nguyen tac tham chieu

- Hoc tu Google Analytics:
  - property switcher ro rang
  - reports snapshot cho executive view
  - report collections theo use case
- Hoc tu Matomo:
  - multi-website management
  - dashboard/widget mindset
  - left navigation theo tang ro rang

## IA moi

### 1. Workspace level

- `/dashboard` -> Workspace
- `/dashboard/sites` -> Websites

### 2. Website level

- `/dashboard/sites/:siteId` -> Website Home

### 3. App level trong website

- `Analytics`
- `Support Tickets`
- `Email Campaigns`

### 4. Analytics sub-navigation

Giu nguyen cac route analytics hien tai, nhung duoc dat duoi app `Analytics` trong shell:

- Overview
- Trend
- Sources
- Campaigns
- Pages
- Products
- Funnel
- Realtime
- Customers
- Bots
- Exports
- Health

## Shell moi

### App Rail

- Workspace
- Websites
- Website

### Website Sidebar

Khi da chon website:

1. Current website card
2. Apps
   - Home
   - Analytics
   - Support Tickets
   - Email Campaigns
3. Analytics sections
4. Setup
5. Recommendations / Quick actions

## Page strategy

### Workspace

Khong con la portfolio analytics thuần.

No tro thanh:
- website readiness
- app adoption
- needs attention
- recent activity

### Website Home

Trang hub cho tung website:
- status
- app cards
- setup progress
- quick actions

### Analytics

Giu nguyen data model va feature hien co.
Chi doi:
- vi tri trong navigation
- wording theo app context
- visual hierarchy cho hop voi shell moi

### Support Tickets / Email Campaigns

Giai doan nay chi can placeholder page va nav slot.

## Phase thuc hien

### Phase 1: Information architecture
- [x] Tao `Website Home`
- [x] Tach `Apps` khoi `Analytics sections`
- [x] Cap nhat shell cho website-first navigation
- [x] Chuan hoa page meta / breadcrumbs / top nav wording

### Phase 2: Workspace redesign
- [x] Lam lai `/dashboard` thanh workspace home
- [x] Hien website readiness, app adoption, needs attention
- [x] Giam cam giac day la mot analytics report

### Phase 3: Website home
- [x] Tao hub page cho tung website
- [x] Them app cards va setup summary
- [x] Them quick actions

### Phase 4: Analytics reframing
- [x] Chuyen wording trong Analytics theo app context
- [x] Ra soat section grouping:
  - Acquisition
  - Content / Commerce
  - Operations
- [x] Giu nguyen feature hien tai

### Phase 5: Future app readiness
- [x] Placeholder page cho Support Tickets
- [x] Placeholder page cho Email Campaigns
- [x] Chuan bi shared page patterns cho app moi

### Phase 6: Visual audit
- [x] Lam shell gan voi GA/Matomo hon
- [x] Giam noise, tang data density hop ly
- [x] Chuan hoa status, cards, table hierarchy

## Ghi chu implementation

- Uu tien thay doi shell va route architecture truoc
- Khong refactor API neu khong can
- Co the giu analytics pages o route cu trong giai doan dau
- Neu can doi route sau, them redirect mem de tranh gay bookmarks
