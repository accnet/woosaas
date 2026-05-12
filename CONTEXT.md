# Woosaas Context

This file is the short operational context for the `V2.0.0` branch.

## Product Shape

Woosaas is no longer just an analytics viewer. In this branch it behaves as a small operator console for WooCommerce stores with three primary dashboard apps:

- `Analytics`
- `Orders`
- `Contacts`

Analytics remains ClickHouse-first.
Orders and canonical contact summaries are PostgreSQL-first.

## Repository Boundary

Inside this repo:

- Go API
- worker
- migrations
- Next.js dashboard
- local docker setup

Outside this repo:

- active WordPress plugin at `/var/www/site1.local/wp-content/plugins/plugin`

That plugin is responsible for:

- browser and commerce tracking on WordPress / WooCommerce
- sending each newly created order plus later order snapshots to `/api/v1/woo/orders/sync`
- reporting backfill cursor/state to `/api/v1/woo/orders/backfill-state`
- admin-side sync/backfill controls

## Architecture

### Event path

1. plugin or client sends event payload to `/api/v1/collect`
2. API authenticates by site API key
3. collector writes event batches to Redis-backed processing flow
4. worker flushes data into ClickHouse
5. dashboard reads reporting endpoints under `/api/v1/stats/*`

### Order path

1. plugin sends a canonical snapshot immediately when a WooCommerce order is created, then sends later changes to `/api/v1/woo/orders/sync`
2. API validates payloads and publishes to Redis stream `orders:stream`
3. worker consumes the stream and writes to PostgreSQL
4. plugin reports backfill progress to `/api/v1/woo/orders/backfill-state`
5. dashboard reads:
   - `/api/v1/orders`
   - `/api/v1/orders/:woo_order_id`
   - `/api/v1/contacts`
   - `/api/v1/sites/:site_id/orders/sync-state`

## Persistence Split

### ClickHouse

Use ClickHouse for:

- event storage
- analytics queries
- realtime and funnel reporting
- legacy customer activity surfaces behind `stats/customers`

### PostgreSQL

Use PostgreSQL for:

- users
- sites
- site API keys
- memberships / teams
- canonical Woo orders
- `woo_order_items`
- `woo_order_contacts`
- `woo_order_sync_state`

## Important Implementation Notes

### Routing and app hierarchy

- app rail treats `Analytics`, `Orders`, and `Contacts` as peers
- `Orders` and `Contacts` intentionally do not show the left secondary sidebar
- canonical contact route is `/contacts`
- `/customers` is compatibility-only redirect UI

### Worker behavior

- the worker consumes both analytics and order streams
- there was a critical multi-stream `XREADGROUP` argument-order bug previously; this branch contains the fix
- `orders:stream` is the canonical Redis stream for order materialization

### Migrations

- Docker mounts the whole `api/migrations_postgres` directory into Postgres init
- migration runner loads all SQL files, not only the initial bootstrap file

## Current Frontend State

Orders app:

- list page
- detail page with operator-style layout
- payment summary
- activity timeline
- order info sidebar
- raw-order image/avatar extraction fallback from `raw_order`

Contacts app:

- list page
- detail page
- contact-focused copy in UI

Shared UI:

- table alignment fix moved row visuals from `tr` to `td`
- utility override currently forces `.right-3` and `.right-4` to `-0.8rem`

## Local Runtime Assumptions

- API usually at `http://localhost:8080`
- dashboard dev commonly at `http://localhost:3001`
- Docker Compose is the primary local backend runtime

## Current Risks / Caveats

- plugin code is versioned elsewhere, so repo-level completeness depends on coordinating both repos
- API naming still contains legacy `customers` routes in the analytics layer even though dashboard copy now says `Contacts`
- some older planning docs are ahead of or behind code in places; trust `README.md`, `CONTEXT.md`, and current implementation over stale roadmap wording

## Good First Places To Look

- `api/internal/api/router.go`
- `api/internal/orders/`
- `api/internal/worker/consumer.go`
- `dashboard/src/lib/navigation.ts`
- `dashboard/src/components/ui/dashboard-shell.tsx`
- `dashboard/src/app/dashboard/[siteId]/orders/`
- `dashboard/src/app/dashboard/[siteId]/contacts/`
