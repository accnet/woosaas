# Woosaas - Phân Tích Dự Án & Cấu Trúc Thư Mục

## 1. Tổng Quan Dự Án

**Woosaas** là nền tảng Analytics SaaS dành cho chủ shop WordPress/WooCommerce, giúp họ theo dõi nguồn traffic, doanh thu, funnel và hành vi khách hàng.

### 1.1 Mục Tiêu MVP
- WordPress plugin cài được trên site WooCommerce
- Tracking pageview, session, client, UTM/referrer/click ID
- Tracking ecommerce events: product view, add to cart, checkout, purchase
- Backend nhận event an toàn, batch insert vào ClickHouse
- Dashboard hiển thị overview, trend, sources, pages, products, funnel, realtime
- Site owner tạo site, lấy API key/tracking code, verify tracking

### 1.2 Tech Stack
| Thành phần | Công nghệ | Mục đích |
|------------|-----------|----------|
| Client | WordPress Plugin (JS + PHP) | Thu thập event từ trình duyệt và server |
| Backend | Go (Gin framework) | API, Ingestion, Worker, Query |
| Analytics DB | ClickHouse | Lưu trữ event data, truy vấn analytics |
| Business DB | PostgreSQL | Users, sites, API keys, subscriptions |
| Cache/Queue | Redis | Streams, cache, rate limit, realtime |
| Frontend | Next.js + ECharts | Dashboard analytics |

---

## 2. Kiến Trúc Hệ Thống

```
┌─────────────────────────────────────────────────────────────────────┐
│                        WordPress / WooCommerce                       │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌───────────┐ │
│  │ JS Tracker  │  │ PHP Hooks    │  │ Attribution │  │ Settings  │ │
│  └─────────────┘  └──────────────┘  └─────────────┘  └───────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          Golang Backend                              │
│  ┌─────────┐  ┌──────────┐  ┌─────────┐  ┌─────────┐  ┌──────────┐ │
│  │ API     │  │ Ingestion│  │ Worker  │  │ Query   │  │ Manager  │ │
│  └─────────┘  └──────────┘  └─────────┘  └─────────┘  └──────────┘ │
└─────────────────────────────────────────────────────────────────────┘
         │                                    │
         ▼                                    ▼
┌─────────────────┐                 ┌─────────────────┐
│     Redis       │                 │   ClickHouse    │
│  (Queue/Cache)  │                 │   (Analytics)   │
└─────────────────┘                 └─────────────────┘
         │                                    │
         ▼                                    ▼
┌─────────────────┐                 ┌─────────────────┐
│   PostgreSQL     │                 │    Next.js      │
│  (Business DB)  │                 │   Dashboard     │
└─────────────────┘                 └─────────────────┘
```

---

## 3. Phân Tích Các Module

### 3.1 WordPress Plugin (`/plugin`)
| Module | Mô tả | File |
|--------|-------|------|
| JS Tracker | Tạo client_id, session_id, gửi pageview và browser events | `assets/js/tracker.js` |
| Attribution | Parse UTM, click ID, referrer, direct; lưu cookie | `includes/attribution.php` |
| Woo Hooks | Gửi add to cart, checkout, purchase từ server-side | `includes/woocommerce.php` |
| Collector | Gửi event về API | `includes/collector.php` |
| Admin Settings | Nhập API key, verify site, bật/tắt tracking | `includes/admin.php` |

**Cookies cần dùng:**
- `woosaas_client_id`: 12 tháng - Nhận diện visitor ẩn danh
- `woosaas_session_id`: 30 phút inactivity - Gom event thành session
- `woosaas_attribution`: 90 ngày - Lưu source/medium/campaign

### 3.2 Golang Backend (`/api`)
| Service | Trách nhiệm | Path |
|---------|-------------|------|
| API | Routing, auth, CORS, rate limit, request validation | `cmd/server/` |
| Ingestion | Validate event, normalize payload, push Redis Stream | `internal/ingest/` |
| Worker | Đọc Redis Stream, batch insert ClickHouse, retry | `cmd/worker/` |
| Management | Auth, user, site, API key | `internal/sites/`, `internal/auth/` |
| Query | Query ClickHouse/Redis cho dashboard | `internal/query/` |

### 3.3 Frontend Dashboard (`/app`)
| Page | Nội dung |
|------|----------|
| Login/Register | Auth cơ bản |
| Sites | Tạo site, xem API key, tracking instructions |
| Onboarding | Cài plugin, nhập API key, verify event |
| Overview | Visits, users, orders, revenue, CR |
| Trend | Biểu đồ traffic/revenue theo thời gian |
| Sources | Source/medium/campaign performance |
| Pages | Top landing pages, top viewed pages |
| Products | Views, add to cart, purchases, revenue |
| Funnel | Product view -> add to cart -> checkout -> purchase |
| Realtime | Online users 5 phút gần nhất |
| Bot Report | Bot score/reason summary |

---

## 4. Thiết Kế Database

### 4.1 ClickHouse - Analytics Events
```sql
-- Partition: theo tháng
-- Order by: (site_id, event_date, event_name)
-- TTL: 12 tháng tự xóa
```

### 4.2 PostgreSQL - Business Data
| Table | Mục đích |
|-------|----------|
| `users` | Tài khoản dashboard |
| `sites` | Website, domain, timezone |
| `api_keys` | API key hash, status |
| `site_members` | Phân quyền user-site |
| `tracking_verifications` | Trạng thái verify |

### 4.3 Redis Keys
| Key Pattern | Type | TTL | Mục đích |
|-------------|------|-----|----------|
| `events:stream` | Stream | - | Queue event ingestion |
| `events:dead` | Stream | - | Dead letter |
| `api_key:{hash}` | String | 5-15p | Cache API key |
| `rate:{site_id}:{minute}` | String | 2p | Rate limit |
| `online:{site_id}` | ZSET | - | User online |
| `dedupe:{site_id}:{event_id}` | String | 24-72h | Chống duplicate |

---

## 5. Cấu Trúc Thư Mục Đề Xuất

```
woosaas/
├── README.md
├── .env.example
├── docker-compose.yml
├── Makefile
│
├── api/                             # Golang Backend
│   ├── cmd/
│   │   ├── server/                  # API server entry point
│   │   │   └── main.go
│   │   └── worker/                  # Worker process entry point
│   │       └── main.go
│   │
│   ├── internal/                    # Internal packages
│   │   ├── api/                     # HTTP handlers & routing
│   │   │   ├── router.go
│   │   │   ├── middleware/          # Auth, CORS, Rate limit, etc.
│   │   │   ├── handlers/            # HTTP handlers
│   │   │   │   ├── auth.go
│   │   │   │   ├── sites.go
│   │   │   │   ├── collect.go
│   │   │   │   └── stats.go
│   │   │   └── response.go
│   │   │
│   │   ├── auth/                    # Authentication logic
│   │   │   ├── jwt.go
│   │   │   ├── password.go
│   │   │   └── session.go
│   │   │
│   │   ├── config/                  # Configuration loader
│   │   │   └── config.go
│   │   │
│   │   ├── database/                # Database connections
│   │   │   ├── clickhouse.go
│   │   │   ├── postgres.go
│   │   │   └── redis.go
│   │   │
│   │   ├── ingest/                  # Event ingestion
│   │   │   ├── validator.go
│   │   │   ├── normalizer.go
│   │   │   ├── producer.go
│   │   │   └── events.go
│   │   │
│   │   ├── sites/                   # Site management
│   │   │   ├── service.go
│   │   │   ├── repository.go
│   │   │   └── api_keys.go
│   │   │
│   │   ├── query/                   # Analytics queries
│   │   │   ├── overview.go
│   │   │   ├── trend.go
│   │   │   ├── sources.go
│   │   │   ├── pages.go
│   │   │   ├── products.go
│   │   │   ├── funnel.go
│   │   │   └── bots.go
│   │   │
│   │   ├── realtime/                # Real-time features
│   │   │   ├── online_users.go
│   │   │   └── cleanup.go
│   │   │
│   │   ├── worker/                   # Worker logic
│   │   │   ├── consumer.go
│   │   │   ├── batch.go
│   │   │   ├── retry.go
│   │   │   └── dedup.go
│   │   │
│   │   ├── bot/                     # Bot detection
│   │   │   ├── scorer.go
│   │   │   ├── signals.go
│   │   │   └── ua_parser.go
│   │   │
│   │   └── utils/                   # Utilities
│   │       ├── geoip.go
│   │       ├── hash.go
│   │       └── time.go
│   │
│   ├── migrations/                   # Database migrations
│   │   ├── clickhouse/
│   │   │   └── 001_create_events.sql
│   │   └── postgres/
│   │       ├── 001_create_users.sql
│   │       ├── 002_create_sites.sql
│   │       ├── 003_create_api_keys.sql
│   │       └── 004_create_site_members.sql
│   │
│   ├── pkg/                         # Public packages
│   │   └── models/                   # Shared models
│   │       ├── event.go
│   │       ├── site.go
│   │       └── user.go
│   │
│   ├── go.mod
│   └── go.sum
│
├── app/                             # Next.js Dashboard
│   ├── package.json
│   ├── next.config.js
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   │
│   ├── src/
│   │   ├── app/                     # App Router pages
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx             # Landing/login
│   │   │   ├── (auth)/
│   │   │   │   ├── login/page.tsx
│   │   │   │   └── register/page.tsx
│   │   │   │
│   │   │   ├── (dashboard)/
│   │   │   │   ├── layout.tsx       # Dashboard layout
│   │   │   │   ├── sites/
│   │   │   │   │   ├── page.tsx     # Sites list
│   │   │   │   │   ├── new/page.tsx # Create site
│   │   │   │   │   └── [id]/
│   │   │   │   │       ├── page.tsx        # Site settings
│   │   │   │   │       ├── api-keys/page.tsx
│   │   │   │   │       └── onboarding/page.tsx
│   │   │   │   │
│   │   │   │   ├── overview/page.tsx
│   │   │   │   ├── trend/page.tsx
│   │   │   │   ├── sources/page.tsx
│   │   │   │   ├── pages/page.tsx
│   │   │   │   ├── products/page.tsx
│   │   │   │   ├── funnel/page.tsx
│   │   │   │   ├── realtime/page.tsx
│   │   │   │   └── bots/page.tsx
│   │   │   │
│   │   │   └── api/                 # API routes (if needed)
│   │   │
│   │   ├── components/
│   │   │   ├── ui/                  # Base UI components
│   │   │   │   ├── button.tsx
│   │   │   │   ├── input.tsx
│   │   │   │   ├── card.tsx
│   │   │   │   ├── table.tsx
│   │   │   │   ├── modal.tsx
│   │   │   │   └── ...
│   │   │   │
│   │   │   ├── charts/              # ECharts components
│   │   │   │   ├── line-chart.tsx
│   │   │   │   ├── bar-chart.tsx
│   │   │   │   ├── pie-chart.tsx
│   │   │   │   ├── funnel-chart.tsx
│   │   │   │   └── area-chart.tsx
│   │   │   │
│   │   │   ├── dashboard/           # Dashboard components
│   │   │   │   ├── stat-card.tsx
│   │   │   │   ├── metric-card.tsx
│   │   │   │   ├── date-range-picker.tsx
│   │   │   │   ├── realtime-widget.tsx
│   │   │   │   ├── top-table.tsx
│   │   │   │   └── nav-sidebar.tsx
│   │   │   │
│   │   │   └── forms/               # Form components
│   │   │       ├── login-form.tsx
│   │   │       ├── register-form.tsx
│   │   │       └── site-form.tsx
│   │   │
│   │   ├── lib/                     # Utilities
│   │   │   ├── api.ts               # API client
│   │   │   ├── auth.ts              # Auth utilities
│   │   │   ├── utils.ts
│   │   │   └── constants.ts
│   │   │
│   │   ├── hooks/                   # React hooks
│   │   │   ├── use-auth.ts
│   │   │   ├── use-sites.ts
│   │   │   ├── use-stats.ts
│   │   │   └── use-realtime.ts
│   │   │
│   │   ├── types/                   # TypeScript types
│   │   │   ├── event.ts
│   │   │   ├── site.ts
│   │   │   ├── user.ts
│   │   │   └── stats.ts
│   │   │
│   │   └── store/                   # State management
│   │       └── auth-store.ts
│   │
│   └── public/
│       └── images/
│
├── plugin/                          # WordPress Plugin
│   ├── woosaas.php                  # Main plugin file
│   ├── uninstall.php                # Cleanup on uninstall
│   │
│   ├── includes/                    # PHP includes
│   │   ├── class-woosaas.php        # Main class
│   │   ├── class-tracker.php        # Event tracker
│   │   ├── class-attribution.php    # Attribution handling
│   │   ├── class-woocommerce.php    # WooCommerce hooks
│   │   ├── class-api.php            # API client
│   │   ├── admin/
│   │   │   ├── class-admin.php      # Admin interface
│   │   │   ├── settings-page.php    # Settings page
│   │   │   └── views/               # Admin views
│   │   │       ├── settings-view.php
│   │   │       └── verify-view.php
│   │   └── utils/
│   │       ├── class-cookie.php     # Cookie handling
│   │       ├── class-device.php      # Device detection
│   │       └── helpers.php
│   │
│   ├── assets/                      # Frontend assets
│   │   ├── js/
│   │   │   ├── tracker.js           # Main tracker
│   │   │   ├── pageview.js          # Pageview tracking
│   │   │   ├── ecommerce.js         # E-commerce events
│   │   │   └── lib/
│   │   │       ├── uuid.js          # UUID generation
│   │   │       └── queue.js         # Event queue
│   │   │
│   │   └── css/
│   │       └── admin.css            # Admin styles
│   │
│   ├── languages/                   # i18n
│   │   └── woosaas.pot
│   │
│   └── readme.txt                   # WordPress readme
│
├── docker/                          # Docker configurations
│   ├── postgres/
│   │   └── init.sql                 # PostgreSQL init scripts
│   │
│   ├── clickhouse/
│   │   ├── config.xml               # ClickHouse config
│   │   └── users.xml                # ClickHouse users
│   │
│   ├── redis/
│   │   └── redis.conf               # Redis config
│   │
│   ├── api/
│   │   └── Dockerfile               # API container
│   │
│   └── app/
│       └── Dockerfile               # Dashboard container
│
├── tests/                           # Tests
│   ├── api/
│   │   ├── handlers_test.go
│   │   ├── ingest_test.go
│   │   └── query_test.go
│   │
│   ├── plugin/
│   │   └── test-attribution.php
│   │
│   └── app/
│       └── components.test.tsx
│
├── docs/                            # Documentation
│   ├── api.md                       # API documentation
│   ├── deployment.md                # Deployment guide
│   ├── local-setup.md               # Local development setup
│   ├── plugin-setup.md              # WordPress plugin setup
│   ├── architecture.md              # Architecture details
│   ├── data-model.md                # Data model
│   └── contributing.md              # Contributing guide
│
└── scripts/                         # Utility scripts
    ├── dev.sh                       # Start dev environment
    ├── prod.sh                      # Production deployment
    └── test.sh                      # Run tests
```

---

## 6. Mô Tả Chi Tiết Thư Mục

### 6.1 API Server (`/api`)

**Structure theo Layer:**
```
api/
├── cmd/           # Entry points (server/, worker/)
├── internal/      # Private application code
│   ├── api/       # HTTP layer (handlers, middleware)
│   ├── ingest/    # Event ingestion logic
│   ├── query/     # Analytics queries
│   ├── sites/     # Site management
│   ├── auth/      # Authentication
│   ├── database/  # DB connections
│   └── worker/    # Batch worker logic
├── migrations/    # DB migrations
└── pkg/           # Public packages (models)
```

### 6.2 Plugin (`/plugin`)

**WordPress Plugin Structure chuẩn:**
```
plugin/
├── woosaas.php              # Main plugin file
├── uninstall.php           # Cleanup on uninstall
├── includes/                # PHP classes
│   ├── class-*.php          # Core classes
│   ├── admin/              # Admin interface
│   └── utils/              # Utilities
├── assets/                 # JS, CSS, images
└── languages/              # i18n
```

### 6.3 Dashboard (`/app`)

**Next.js App Router Structure:**
```
app/
├── src/
│   ├── app/               # Pages (App Router)
│   │   ├── (auth)/        # Auth group
│   │   ├── (dashboard)/  # Dashboard group
│   │   └── api/          # API routes
│   ├── components/        # Reusable components
│   │   ├── ui/           # Base components
│   │   ├── charts/       # Chart components
│   │   └── dashboard/    # Feature components
│   └── lib/              # Utilities
└── public/                # Static assets
```

---

## 7. Scripts & Commands

### Makefile Commands

```makefile
# Development
dev            - Start local development
dev-backend    - Start backend only
dev-dashboard  - Start dashboard only
dev-plugin     - Start WordPress with plugin

# Database
db-migrate     - Run migrations
db-seed        - Seed test data
db-reset       - Reset databases

# Testing
test           - Run all tests
test-backend   - Run backend tests
test-plugin    - Run plugin tests

# Build
build          - Build all
build-backend  - Build Go binary
build-plugin   - Build WordPress plugin

# Production
deploy         - Deploy to production
```

---

## 8. Environment Variables

```env
# Backend
BACKEND_PORT=8080
BACKEND_HOST=0.0.0.0
JWT_SECRET=your-secret-key

# ClickHouse
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=9000
CLICKHOUSE_DB=woosaas
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=

# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=woosaas
POSTGRES_USER=postgres
POSTGRES_PASSWORD=

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Dashboard
NEXT_PUBLIC_API_URL=http://localhost:8080
```

---

## 9. Dependencies

### Backend (Go)
- `github.com/gin-gonic/gin` - HTTP framework
- `github.com/clickhouse/clickhouse-go` - ClickHouse client
- `github.com/lib/pq` - PostgreSQL driver
- `github.com/redis/go-redis/v9` - Redis client
- `github.com/golang-jwt/jwt/v5` - JWT handling
- `github.com/mssola/useragent` - UA parsing
- `github.com/go-playground/validator/v10` - Validation

### Dashboard (Node.js)
- `next` - Framework
- `react` - UI library
- `echarts` - Charts
- `@echarts-for-react` - React bindings for ECharts
- `tailwindcss` - Styling
- `zustand` - State management
- `axios` - HTTP client

---

## 10. Tiếp Theo

1. **Phase 0**: Tạo repository, Docker Compose, migrations
2. **Phase 1**: Backend foundation (Go project, routes, DB connections)
3. **Phase 2**: Ingestion pipeline (collect API, Redis, Worker)
4. **Phase 3**: WordPress Plugin MVP
5. **Phase 4**: Reporting endpoints
6. **Phase 5**: Dashboard MVP
7. **Phase 6**: Hardening & Beta