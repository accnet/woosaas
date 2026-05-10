# Woosaas V2.0.0

Woosaas is a WooCommerce analytics and operations stack built around:

- a Go API
- a Redis-backed worker
- ClickHouse for event analytics
- PostgreSQL for application and order state
- a Next.js dashboard
- a WordPress plugin installed outside this repo

This branch reflects the current `V2.0.0` application state, including the canonical Woo order sync pipeline and the dashboard `Analytics / Orders / Contacts` app split.

## What Works

- event collection via API key auth
- analytics queries from ClickHouse
- site, API key, and team management
- realtime and bot reporting
- CSV exports
- canonical Woo order ingestion into PostgreSQL
- orders list and order detail in dashboard
- contacts app and contact detail in dashboard

## Repos And Boundaries

This repo contains:

- `api/`: Go API, worker, migrations, domain logic
- `dashboard/`: Next.js dashboard
- `docker-compose.yml`: local stack orchestration
- `docs/`: setup and operational docs

This repo does not contain the active WordPress plugin source used in local development.

Current local plugin path:

```bash
/var/www/site1.local/wp-content/plugins/plugin
```

If plugin behavior changes, remember that plugin commits and pushes happen in that separate repo, not here.

## Stack

| Layer | Technology |
| --- | --- |
| Dashboard | Next.js 15 |
| API | Go + Gin |
| Queue / stream | Redis Streams |
| Analytics store | ClickHouse |
| App / order store | PostgreSQL |
| Local orchestration | Docker Compose |

## Key Flows

### 1. Event analytics

1. WordPress or script sends events to `POST /api/v1/collect` or `/api/v1/collect/batch`
2. API validates the site API key and pushes events into Redis
3. Worker flushes event batches into ClickHouse
4. Dashboard reads aggregated analytics from `/api/v1/stats/*`

### 2. Woo order sync

1. WooCommerce plugin posts order snapshots to `POST /api/v1/woo/orders/sync`
2. API validates payloads and enqueues them to Redis stream `orders:stream`
3. Worker consumes order messages and materializes them into PostgreSQL
4. Dashboard reads orders, contacts, and sync state from order endpoints

## Main API Surfaces

Auth and app management:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/me`
- `GET /api/v1/sites`
- `POST /api/v1/sites`
- `GET /api/v1/sites/:site_id/api-keys`

Collection:

- `POST /api/v1/collect`
- `POST /api/v1/collect/batch`
- `GET /api/v1/collect/verify`

Analytics:

- `GET /api/v1/stats/overview`
- `GET /api/v1/stats/trend`
- `GET /api/v1/stats/sources`
- `GET /api/v1/stats/campaigns`
- `GET /api/v1/stats/pages`
- `GET /api/v1/stats/products`
- `GET /api/v1/stats/funnel`
- `GET /api/v1/stats/realtime`
- `GET /api/v1/stats/realtime/events`
- `GET /api/v1/stats/bots`
- `GET /api/v1/stats/health`
- `GET /api/v1/stats/export`
- `GET /api/v1/stats/customers`
- `GET /api/v1/stats/customers/:client_id`

Orders:

- `POST /api/v1/woo/orders/sync`
- `GET /api/v1/orders`
- `GET /api/v1/orders/:woo_order_id`
- `GET /api/v1/contacts`
- `GET /api/v1/sites/:site_id/orders/sync-state`

## Local Development

### Full stack

```bash
./start.sh start
```

This does the following:

- loads `.env`
- builds and starts Docker services
- runs migrations
- checks plugin path presence
- waits for API health

Useful commands:

```bash
./start.sh logs api
./start.sh logs worker
./start.sh migrate
./start.sh smoke
./start.sh stop
```

### Dashboard dev server

From `dashboard/`:

```bash
npm install
npm run dev -- --port 3001
```

Current local dev URL commonly used on this branch:

```bash
http://localhost:3001
```

### API tests

```bash
cd api
go test ./...
```

### Dashboard build

```bash
npm --prefix dashboard run build
```

## Data Stores

ClickHouse is used for:

- event analytics
- reporting
- customer activity timelines used by legacy `stats/customers` APIs

PostgreSQL is used for:

- auth and sites
- API keys
- team membership
- canonical Woo orders
- order items
- order contacts
- order sync state

## Important Files

- `docker-compose.yml`: local services
- `start.sh`: local bootstrap helper
- `api/cmd/server/main.go`: API entrypoint
- `api/cmd/worker/main.go`: worker entrypoint
- `api/cmd/migrate/main.go`: migration runner
- `api/internal/api/router.go`: route registration
- `api/internal/orders/`: PostgreSQL order domain
- `api/internal/worker/consumer.go`: Redis stream consumer
- `api/migrations_postgres/002_woo_orders.sql`: canonical order schema
- `dashboard/src/lib/navigation.ts`: app hierarchy
- `dashboard/src/app/dashboard/[siteId]/orders/`: orders UI
- `dashboard/src/app/dashboard/[siteId]/contacts/`: contacts UI

## Known Current State

- dashboard app hierarchy is `Analytics`, `Orders`, `Contacts`
- canonical contacts route is `/dashboard/[siteId]/contacts`
- legacy `/customers` routes still exist as redirects for compatibility
- WordPress plugin code is maintained outside this repo
- some older docs may still refer to `customers` naming at the API layer; UI uses `Contacts`

## Additional Docs

- [docs/local-setup.md](docs/local-setup.md)
- [docs/plugin-setup.md](docs/plugin-setup.md)
- [docs/plugin-test-checklist.md](docs/plugin-test-checklist.md)
- [docs/observability-alerts.md](docs/observability-alerts.md)

